"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import type {
  AttributeInput, AttributeValueInput, BrandInput, CatalogAdminData, CategoryInput, ColorInput, LineInput,
  MasterResult, OptionTypeInput, OptionValueInput,
} from "@/lib/catalog/admin-types";
import {
  attributeLinkChanges, categoryActivationError, categoryPlacementError, colorDeleteError, departmentDeactivationError,
  inUseMessage, manualSlugError, normalizeHex, sameName, singleValueChangeError, uniqueSlug,
} from "@/lib/catalog/masters";
import { slugify } from "@/lib/catalog-migration/cleanup-plan";
import { canEdit } from "@/lib/permissions";
import { getCatalogAdminData } from "@/lib/queries/catalog-admin";
import { invalidateCatalogMasters } from "@/lib/queries/catalog";
import { invalidateCatalogRefs } from "@/lib/queries/products";
import { getSession } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/pagination";

type Db = Awaited<ReturnType<typeof createClient>>;
type Table = "colors" | "option_types" | "option_values" | "attributes" | "attribute_values" | "categories" | "brands" | "product_lines";
type Failure = { error: string };

function failure(error: unknown, duplicate: string, slugDuplicate = "Ya existe un registro con ese slug."): Failure {
  const dbError = error as { code?: string; message?: string; details?: string } | null;
  return { error: dbError?.code === "23505"
    ? /slug/i.test(`${dbError.message ?? ""} ${dbError.details ?? ""}`) ? slugDuplicate : duplicate
    : dbError?.code === "23503" ? "No se puede borrar porque el registro está en uso." : "No se pudo guardar el catálogo. Inténtalo de nuevo." };
}

function required(value: string, label: string): Failure | null {
  return value.trim() ? null : { error: `${label} es obligatorio.` };
}

function duplicateName<T extends { id: string }>(items: T[], id: string | undefined, name: string, pick: (item: T) => string, label: string): Failure | null {
  return items.some((item) => item.id !== id && sameName(pick(item), name))
    ? { error: `Ya existe ${label} con ese nombre.` } : null;
}

function slugFor(name: string, supplied: string | undefined, current: { id: string; slug: string | null } | undefined, peers: { id: string; slug: string | null }[]): string | null | Failure {
  if (current && supplied === undefined) return current.slug;
  const otherSlugs = peers.filter((row) => row.id !== current?.id).map((row) => row.slug ?? "");
  if (supplied !== undefined) {
    const invalid = manualSlugError(supplied); if (invalid) return { error: invalid };
    const slug = slugify(supplied);
    return otherSlugs.includes(slug) ? { error: "Ya existe un registro con ese slug." } : slug;
  }
  return uniqueSlug(name, otherSlugs);
}

function nextOrder(items: { sortOrder: number }[]): number {
  return Math.max(-1, ...items.map((item) => item.sortOrder)) + 1;
}

async function write(db: Db, table: Table, id: string | undefined, payload: Record<string, unknown>, duplicate: string, slugDuplicate?: string): Promise<MasterResult> {
  const query = db.from(table as "colors");
  const result = id
    ? await query.update(payload as never).eq("id", id).select("id").maybeSingle()
    : await query.insert(payload as never).select("id").single();
  if (result.error) return failure(result.error, duplicate, slugDuplicate);
  if (!result.data) return { error: "Registro no encontrado." };
  return { ok: true, id: result.data.id };
}

async function remove(db: Db, table: Table, id: string): Promise<MasterResult> {
  const { data, error } = await db.from(table as "colors").delete().eq("id", id).select("id").maybeSingle();
  if (error) return failure(error, "Ya existe un registro con ese nombre.");
  return data ? { ok: true, id } : { error: "Registro no encontrado." };
}

type Scope = { column: string; value: string | null };

async function rows<T>(db: Db, table: Table | "color_families" | "category_attributes" | "products" | "product_variants" | "product_media" | "product_attribute_values", columns: string, scope?: Scope): Promise<T[]> {
  return fetchAllRows<T>((from, to) => {
    const ordered = db.from(table as "colors").select(columns).order(table === "category_attributes" ? "category_id" : table === "product_attribute_values" ? "product_id" : "id");
    const query = (table === "category_attributes" ? ordered.order("attribute_id") : table === "product_attribute_values" ? ordered.order("attribute_value_id") : ordered).range(from, to);
    const filtered = scope ? scope.value === null ? query.is(scope.column as "id", null) : query.eq(scope.column as "id", scope.value) : query;
    return filtered as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  });
}

async function count(db: Db, table: "products" | "product_variants" | "product_media" | "category_attributes" | "product_attribute_values" | "categories", column: string, value: string): Promise<number> {
  const { count: total, error } = await db.from(table as "products").select(table === "category_attributes" ? "category_id" : table === "product_attribute_values" ? "product_id" : "id", { count: "exact", head: true }).eq(column as "id", value);
  if (error) throw error;
  return total ?? 0;
}

async function rowsIn<T>(db: Db, table: "product_attribute_values" | "product_variants" | "products", columns: string, column: string, ids: string[]): Promise<T[]> {
  if (!ids.length) return [];
  const result: T[] = [];
  for (let start = 0; start < ids.length; start += 100) {
    const chunk = ids.slice(start, start + 100);
    result.push(...await fetchAllRows<T>((from, to) => {
      const query = db.from(table as "products").select(columns).in(column as "id", chunk).order(table === "product_attribute_values" ? "product_id" : "id");
      const ordered = table === "product_attribute_values" ? query.order("attribute_value_id") : query;
      return ordered.range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
    }));
  }
  return result;
}

type Named = { id: string; name: string; slug: string | null };
type Ordered = { sort_order: number };
type CategoryRow = Named & Ordered & { parent_id: string | null; is_active: boolean };
type OptionRow = { id: string; label: string; slug: string; sort_order: number };
type AttributeRow = { id: string; name: string; code: string; is_multi: boolean; sort_order: number };

async function execute(label: string | (() => string), work: (db: Db) => Promise<MasterResult>): Promise<MasterResult> {
  const session = await getSession();
  if (!session || !canEdit(session.permissions, "Inventario")) return { error: "No tienes permiso para editar el catálogo." };
  try {
    const db = await createClient();
    const result = await work(db);
    if (result?.ok) await audit(typeof label === "string" ? label : label(), "Configuración");
    invalidateCatalogMasters();
    invalidateCatalogRefs();
    revalidatePath("/configuracion");
    revalidatePath("/productos", "layout");
    return result;
  } catch {
    return { error: "No se pudo guardar el catálogo. Inténtalo de nuevo." };
  }
}

export async function saveColor(input: ColorInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} color ${input.name.trim()}`, async (db) => {
    const name = input.name.trim();
    const missing = required(name, "El nombre"); if (missing) return missing;
    const hex = normalizeHex(input.hex); if (!hex) return { error: "El color hexadecimal es obligatorio y debe tener 3 o 6 dígitos." };
    const [families, colors] = await Promise.all([
      rows<{ id: string }>(db, "color_families", "id"),
      rows<Named & Ordered>(db, "colors", "id,name,slug,sort_order"),
    ]);
    if (!families.some((row) => row.id === input.familyId)) return { error: "Selecciona una familia de color válida." };
    const current = colors.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "Color no encontrado." };
    const duplicate = "Ya existe un color con ese nombre.";
    const repeated = duplicateName(colors, input.id, name, (row) => row.name, "un color"); if (repeated) return repeated;
    const slug = slugFor(name, input.slug, current, colors); if (slug && typeof slug !== "string") return slug;
    return write(db, "colors", input.id, { name, hex, family_id: input.familyId, is_active: input.isActive, slug,
      ...(!input.id ? { sort_order: nextOrder(colors.map((row) => ({ sortOrder: row.sort_order }))) } : {}) }, duplicate, "Ya existe un color con ese slug.");
  });
}

export async function deleteColor(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó color ${name}`, async (db) => {
    const row = (await rows<{ id: string; name: string }>(db, "colors", "id,name", { column: "id", value: id }))[0];
    if (!row) return { error: "Color no encontrado." };
    name = row.name;
    const [variantCount, photoCount] = await Promise.all([
      count(db, "product_variants", "color_id", id), count(db, "product_media", "color_id", id),
    ]);
    const used = colorDeleteError(variantCount, photoCount); if (used) return { error: used };
    return remove(db, "colors", id);
  });
}

export async function saveOptionType(input: OptionTypeInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} tipo de opción ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El nombre"); if (missing) return missing;
    const items = await rows<{ id: string; name: string; code: string; sort_order: number }>(db, "option_types", "id,name,code,sort_order");
    if (input.id && !items.some((row) => row.id === input.id)) return { error: "Tipo de opción no encontrado." };
    const repeated = duplicateName(items, input.id, name, (row) => row.name, "un tipo de opción"); if (repeated) return repeated;
    return write(db, "option_types", input.id, { name, ...(!input.id ? { code: uniqueSlug(name, items.map((row) => row.code)), sort_order: nextOrder(items.map((row) => ({ sortOrder: row.sort_order }))) } : {}) }, "Ya existe un tipo de opción con ese nombre.");
  });
}

export async function deleteOptionType(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó tipo de opción ${name}`, async (db) => {
    const row = (await rows<{ id: string; name: string }>(db, "option_types", "id,name", { column: "id", value: id }))[0];
    if (!row) return { error: "Tipo de opción no encontrado." };
    name = row.name;
    const values = await rows<{ id: string }>(db, "option_values", "id", { column: "option_type_id", value: id });
    const [categoryCount, variantUses] = await Promise.all([
      count(db, "categories", "option_type_id", id),
      rowsIn<{ id: string }>(db, "product_variants", "id", "option_value_id", values.map((value) => value.id)),
    ]);
    const used = inUseMessage(categoryCount, "categorías", false) ?? inUseMessage(variantUses.length, "variantes", false);
    if (used) return { error: used };
    return remove(db, "option_types", id);
  });
}

export async function saveOptionValue(input: OptionValueInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} valor de opción ${input.label.trim()}`, async (db) => {
    const label = input.label.trim(); const missing = required(label, "El valor"); if (missing) return missing;
    const type = (await rows<{ id: string }>(db, "option_types", "id", { column: "id", value: input.optionTypeId }))[0];
    if (!type) return { error: "Tipo de opción no encontrado." };
    const values = await rows<OptionRow>(db, "option_values", "id,label,slug,sort_order", { column: "option_type_id", value: input.optionTypeId });
    const current = values.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "El valor no pertenece a este tipo de opción." };
    const repeated = duplicateName(values, input.id, label, (row) => row.label, "un valor de opción"); if (repeated) return repeated;
    const slug = slugFor(label, input.slug, current, values); if (slug && typeof slug !== "string") return slug;
    return write(db, "option_values", input.id, { option_type_id: input.optionTypeId, label, slug, is_active: input.isActive,
      ...(!input.id ? { sort_order: nextOrder(values.map((row) => ({ sortOrder: row.sort_order }))) } : {}) }, "Ya existe un valor de opción con ese nombre.", "Ya existe un valor de opción con ese slug.");
  });
}

export async function deleteOptionValue(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó valor de opción ${name}`, async (db) => {
    const row = (await rows<{ id: string; label: string }>(db, "option_values", "id,label", { column: "id", value: id }))[0];
    if (!row) return { error: "Valor de opción no encontrado." };
    name = row.label;
    const used = inUseMessage(await count(db, "product_variants", "option_value_id", id), "variantes", true); if (used) return { error: used };
    return remove(db, "option_values", id);
  });
}

export async function saveAttribute(input: AttributeInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} característica ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El nombre"); if (missing) return missing;
    const items = await rows<AttributeRow>(db, "attributes", "id,name,code,is_multi,sort_order");
    const current = items.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "Característica no encontrada." };
    const repeated = duplicateName(items, input.id, name, (row) => row.name, "una característica"); if (repeated) return repeated;
    if (current?.is_multi && !input.isMulti) {
      const values = await rows<{ id: string }>(db, "attribute_values", "id", { column: "attribute_id", value: current.id });
      const uses = await rowsIn<{ product_id: string }>(db, "product_attribute_values", "product_id", "attribute_value_id", values.map((row) => row.id));
      const byProduct = new Map<string, number>();
      for (const use of uses) byProduct.set(use.product_id, (byProduct.get(use.product_id) ?? 0) + 1);
      const changeError = singleValueChangeError(current.is_multi, input.isMulti, [...byProduct.values()].filter((count) => count > 1).length);
      if (changeError) return { error: changeError };
    }
    return write(db, "attributes", input.id, { name, is_multi: input.isMulti,
      ...(!input.id ? { code: uniqueSlug(name, items.map((row) => row.code)), sort_order: nextOrder(items.map((row) => ({ sortOrder: row.sort_order }))) } : {}) }, "Ya existe una característica con ese nombre.");
  });
}

export async function deleteAttribute(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó característica ${name}`, async (db) => {
    const row = (await rows<{ id: string; name: string }>(db, "attributes", "id,name", { column: "id", value: id }))[0];
    if (!row) return { error: "Característica no encontrada." };
    name = row.name;
    const values = await rows<{ id: string }>(db, "attribute_values", "id", { column: "attribute_id", value: id });
    const [categoryCount, valueUses] = await Promise.all([
      count(db, "category_attributes", "attribute_id", id),
      rowsIn<{ attribute_value_id: string }>(db, "product_attribute_values", "attribute_value_id", "attribute_value_id", values.map((value) => value.id)),
    ]);
    const used = inUseMessage(categoryCount, "categorías", false) ?? inUseMessage(new Set(valueUses.map((row) => row.attribute_value_id)).size, "valores usados en productos", false);
    if (used) return { error: used };
    return remove(db, "attributes", id);
  });
}

export async function saveAttributeValue(input: AttributeValueInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} valor de característica ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El valor"); if (missing) return missing;
    const attribute = (await rows<{ id: string }>(db, "attributes", "id", { column: "id", value: input.attributeId }))[0];
    if (!attribute) return { error: "Característica no encontrada." };
    const values = await rows<Named & Ordered>(db, "attribute_values", "id,name,slug,sort_order", { column: "attribute_id", value: input.attributeId });
    const current = values.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "El valor no pertenece a esta característica." };
    const repeated = duplicateName(values, input.id, name, (row) => row.name, "un valor de característica"); if (repeated) return repeated;
    const slug = slugFor(name, input.slug, current, values); if (slug && typeof slug !== "string") return slug;
    return write(db, "attribute_values", input.id, { attribute_id: input.attributeId, name, slug, is_active: input.isActive,
      ...(!input.id ? { sort_order: nextOrder(values.map((row) => ({ sortOrder: row.sort_order }))) } : {}) }, "Ya existe un valor de característica con ese nombre.", "Ya existe un valor de característica con ese slug.");
  });
}

export async function deleteAttributeValue(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó valor de característica ${name}`, async (db) => {
    const row = (await rows<{ id: string; name: string }>(db, "attribute_values", "id,name", { column: "id", value: id }))[0];
    if (!row) return { error: "Valor de característica no encontrado." };
    name = row.name;
    const used = inUseMessage(await count(db, "product_attribute_values", "attribute_value_id", id), "productos", true); if (used) return { error: used };
    return remove(db, "attribute_values", id);
  });
}

export async function saveCategory(input: CategoryInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} ${input.parentId ? "categoría" : "departamento"} ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El nombre"); if (missing) return missing;
    const [all, optionTypes, attributes] = await Promise.all([
      rows<CategoryRow>(db, "categories", "id,name,slug,sort_order,parent_id,is_active"),
      input.parentId && input.optionTypeId ? rows<{ id: string }>(db, "option_types", "id", { column: "id", value: input.optionTypeId }) : Promise.resolve([]),
      input.parentId && Array.isArray(input.attributes) && input.attributes.length ? rows<{ id: string }>(db, "attributes", "id") : Promise.resolve([]),
    ]);
    const current = all.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "Categoría no encontrada." };
    const parent = all.find((row) => row.id === input.parentId && row.parent_id === null);
    if (input.parentId && !all.some((row) => row.id === input.parentId)) return { error: "Departamento no encontrado." };
    const placement = categoryPlacementError({ parentId: input.parentId, parentIsDepartment: !!parent, hasChildren: all.some((row) => row.parent_id === input.id) });
    if (placement) return { error: placement };
    if (input.id && input.parentId === input.id) return { error: "Un departamento no puede pertenecer a sí mismo." };
    if (!input.isActive && !input.parentId) {
      const activeChildren = all.filter((row) => row.parent_id === input.id && row.is_active).length;
      const deactivation = departmentDeactivationError(activeChildren); if (deactivation) return { error: deactivation };
    }
    const activation = categoryActivationError({ isActive: input.isActive, parentId: input.parentId, parentIsActive: parent?.is_active ?? false });
    if (activation) return { error: activation };
    if (input.parentId && input.optionTypeId && !optionTypes.some((row) => row.id === input.optionTypeId)) return { error: "Tipo de opción no encontrado." };
    const selectedAttributes = input.parentId ? input.attributes : [];
    if (!Array.isArray(selectedAttributes) || new Set(selectedAttributes.map((row) => row.attributeId)).size !== selectedAttributes.length || selectedAttributes.some((row) => !attributes.some((attribute) => attribute.id === row.attributeId))) return { error: "Las características seleccionadas no son válidas." };
    const repeated = duplicateName(all, input.id, name, (row) => row.name, "una categoría"); if (repeated) return repeated;
    const slug = slugFor(name, input.slug, current, all); if (slug && typeof slug !== "string") return slug;
    const siblings = all.filter((row) => row.parent_id === input.parentId);
    const result = await write(db, "categories", input.id, { name, slug, parent_id: input.parentId, is_active: input.isActive,
      option_type_id: input.parentId ? input.optionTypeId : null, requires_color: input.parentId ? input.requiresColor : false,
      ...(!input.id ? { color: "#0EA5E9" } : {}),
      ...(!input.id || current?.parent_id !== input.parentId ? { sort_order: nextOrder(siblings.map((row) => ({ sortOrder: row.sort_order }))) } : {}) }, "Ya existe una categoría con ese nombre.", "Ya existe una categoría con ese slug.");
    if (!result?.ok || !result.id) return result;
    // Primero se agregan/actualizan las elegidas y luego se quitan las que sobran: si algo falla a
    // mitad, la categoría queda con características de más, nunca sin ninguna.
    const currentLinks = input.id ? (await rows<{ attribute_id: string }>(db, "category_attributes", "attribute_id", { column: "category_id", value: input.id })).map((row) => row.attribute_id) : [];
    const changes = attributeLinkChanges(currentLinks, selectedAttributes);
    if (changes.upsert.length) {
      const { error: upsertError } = await db.from("category_attributes").upsert(
        changes.upsert.map((row) => ({ category_id: result.id!, attribute_id: row.attributeId, is_required: row.required, sort_order: row.sortOrder })),
        { onConflict: "category_id,attribute_id" },
      );
      if (upsertError) return { error: "La categoría se guardó, pero no se pudieron guardar sus características. Inténtalo de nuevo." };
    }
    if (changes.remove.length) {
      const { error: removeError } = await db.from("category_attributes").delete().eq("category_id", result.id).in("attribute_id", changes.remove);
      if (removeError) return { error: "La categoría se guardó, pero no se pudieron quitar algunas características. Inténtalo de nuevo." };
    }
    return result;
  });
}

export async function deleteCategory(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó categoría ${name}`, async (db) => {
    const row = (await rows<{ id: string; name: string }>(db, "categories", "id,name", { column: "id", value: id }))[0];
    if (!row) return { error: "Categoría no encontrada." };
    name = row.name;
    const [products, children] = await Promise.all([count(db, "products", "category_id", id), count(db, "categories", "parent_id", id)]);
    const used = inUseMessage(products, "productos", true) ?? inUseMessage(children, "categorías", true);
    if (used) return { error: used };
    return remove(db, "categories", id);
  });
}

export async function saveBrand(input: BrandInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} marca ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El nombre"); if (missing) return missing;
    const items = await rows<Named>(db, "brands", "id,name,slug");
    const current = items.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "Marca no encontrada." };
    const repeated = duplicateName(items, input.id, name, (row) => row.name, "una marca"); if (repeated) return repeated;
    const slug = slugFor(name, input.slug, current, items); if (slug && typeof slug !== "string") return slug;
    return write(db, "brands", input.id, { name, slug, description: input.description?.trim() || null, is_active: input.isActive }, "Ya existe una marca con ese nombre.", "Ya existe una marca con ese slug.");
  });
}

export async function deleteBrand(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó marca ${name}`, async (db) => {
    const row = (await rows<{ id: string; name: string }>(db, "brands", "id,name", { column: "id", value: id }))[0];
    if (!row) return { error: "Marca no encontrada." };
    name = row.name;
    const lines = await rows<{ id: string }>(db, "product_lines", "id", { column: "brand_id", value: id });
    const [directCount, lineUses] = await Promise.all([
      count(db, "products", "brand_id", id), rowsIn<{ id: string }>(db, "products", "id", "line_id", lines.map((line) => line.id)),
    ]);
    const used = inUseMessage(Math.max(directCount, lineUses.length), "productos", true); if (used) return { error: used };
    return remove(db, "brands", id);
  });
}

export async function saveLine(input: LineInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} línea ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El nombre"); if (missing) return missing;
    const brand = (await rows<{ id: string }>(db, "brands", "id", { column: "id", value: input.brandId }))[0];
    if (!brand) return { error: "Marca no encontrada." };
    const lines = await rows<Named & Ordered>(db, "product_lines", "id,name,slug,sort_order", { column: "brand_id", value: input.brandId });
    const current = lines.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "La línea no pertenece a esta marca." };
    const repeated = duplicateName(lines, input.id, name, (row) => row.name, "una línea"); if (repeated) return repeated;
    const slug = slugFor(name, input.slug, current, lines); if (slug && typeof slug !== "string") return slug;
    return write(db, "product_lines", input.id, { brand_id: input.brandId, name, slug, is_active: input.isActive,
      ...(!input.id ? { sort_order: nextOrder(lines.map((row) => ({ sortOrder: row.sort_order }))) } : {}) }, "Ya existe una línea con ese nombre.", "Ya existe una línea con ese slug.");
  });
}

export async function deleteLine(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó línea ${name}`, async (db) => {
    const row = (await rows<{ id: string; name: string }>(db, "product_lines", "id,name", { column: "id", value: id }))[0];
    if (!row) return { error: "Línea no encontrada." };
    name = row.name;
    const used = inUseMessage(await count(db, "products", "line_id", id), "productos", true); if (used) return { error: used };
    return remove(db, "product_lines", id);
  });
}

async function reorder(table: "option_values" | "attribute_values" | "categories" | "product_lines" | "colors" | "option_types" | "attributes", scopeColumn: string | null, scopeId: string | null, orderedIds: string[]): Promise<MasterResult> {
  let label = "departamentos";
  return execute(() => `Ordenó ${label}`, async (db) => {
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) return { error: "El orden no es válido." };
    const parentTable = table === "option_values" ? "option_types" : table === "attribute_values" ? "attributes"
      : table === "product_lines" ? "brands" : table === "colors" ? "color_families" : table === "categories" && scopeId !== null ? "categories" : null;
    const parent = parentTable && scopeId ? (await rows<{ id: string; name: string; parent_id?: string | null }>(db, parentTable, parentTable === "categories" ? "id,name,parent_id" : "id,name", { column: "id", value: scopeId }))[0] : null;
    if (parentTable && (!parent || parentTable === "categories" && parent.parent_id !== null)) return { error: "El orden no es válido." };
    label = table === "option_values" ? `valores del tipo de opción ${parent!.name}`
      : table === "attribute_values" ? `valores de la característica ${parent!.name}`
      : table === "product_lines" ? `líneas de la marca ${parent!.name}`
      : table === "colors" ? `colores de la familia ${parent!.name}`
      : table === "option_types" ? "tipos de opción"
      : table === "attributes" ? "características"
      : scopeId === null ? "departamentos" : `categorías del departamento ${parent!.name}`;
    const expected = (await rows<{ id: string }>(db, table, "id", scopeColumn ? { column: scopeColumn, value: scopeId } : undefined)).map((row) => row.id);
    if (!expected || orderedIds.length !== expected.length || new Set(orderedIds).size !== expected.length || orderedIds.some((id) => !expected.includes(id))) return { error: "El orden no es válido." };
    for (const [index, id] of orderedIds.entries()) {
      const query = db.from(table as "colors").update({ sort_order: index } as never).eq("id", id);
      const scoped = scopeColumn ? scopeId === null ? query.is(scopeColumn as "id", null) : query.eq(scopeColumn as "id", scopeId) : query;
      const { data: updated, error } = await scoped.select("id").maybeSingle();
      if (error || !updated) return { error: "No se pudo completar el orden." };
    }
    return { ok: true };
  });
}

export async function reorderOptionValues(optionTypeId: string, orderedIds: string[]): Promise<MasterResult> { return reorder("option_values", "option_type_id", optionTypeId, orderedIds); }
export async function reorderAttributeValues(attributeId: string, orderedIds: string[]): Promise<MasterResult> { return reorder("attribute_values", "attribute_id", attributeId, orderedIds); }
export async function reorderCategories(parentId: string | null, orderedIds: string[]): Promise<MasterResult> { return reorder("categories", "parent_id", parentId, orderedIds); }
export async function reorderLines(brandId: string, orderedIds: string[]): Promise<MasterResult> { return reorder("product_lines", "brand_id", brandId, orderedIds); }

/** Datos de Configuración → Catálogo bajo demanda (la sección se carga al abrirla). */
export async function loadCatalogAdminData(): Promise<{ data?: CatalogAdminData; error?: string }> {
  try {
    if (!await getSession()) return { error: "Debes iniciar sesión." };
    return { data: await getCatalogAdminData() };
  } catch {
    return { error: "No se pudo cargar el catálogo." };
  }
}
/** Orden de los colores dentro de una familia. */
export async function reorderColors(familyId: string, orderedIds: string[]): Promise<MasterResult> { return reorder("colors", "family_id", familyId, orderedIds); }
export async function reorderOptionTypes(orderedIds: string[]): Promise<MasterResult> { return reorder("option_types", null, null, orderedIds); }
export async function reorderAttributes(orderedIds: string[]): Promise<MasterResult> { return reorder("attributes", null, null, orderedIds); }
