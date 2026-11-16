"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import type {
  AttributeInput, AttributeValueInput, BrandInput, CategoryInput, ColorInput, LineInput,
  MasterResult, OptionTypeInput, OptionValueInput,
} from "@/lib/catalog/admin-types";
import {
  attributeLinkChanges, categoryActivationError, categoryPlacementError, colorDeleteError, departmentDeactivationError,
  inUseMessage, normalizeHex, sameName, uniqueSlug,
} from "@/lib/catalog/masters";
import { slugify } from "@/lib/catalog-migration/cleanup-plan";
import { canEdit } from "@/lib/permissions";
import { getCatalogAdminData } from "@/lib/queries/catalog-admin";
import { invalidateCatalogMasters } from "@/lib/queries/catalog";
import { invalidateCatalogRefs } from "@/lib/queries/products";
import { getSession } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;
type Table = "colors" | "option_types" | "option_values" | "attributes" | "attribute_values" | "categories" | "brands" | "product_lines";
type Failure = { error: string };

function failure(error: unknown, duplicate: string): Failure {
  const dbError = error as { code?: string } | null;
  return { error: dbError?.code === "23505" ? duplicate : dbError?.code === "23503" ? "No se puede borrar porque el registro está en uso." : "No se pudo guardar el catálogo. Inténtalo de nuevo." };
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
    const slug = slugify(supplied);
    return otherSlugs.includes(slug) ? { error: "Ya existe un registro con ese slug." } : slug;
  }
  return uniqueSlug(name, otherSlugs);
}

function nextOrder(items: { sortOrder: number }[]): number {
  return Math.max(-1, ...items.map((item) => item.sortOrder)) + 1;
}

async function write(db: Db, table: Table, id: string | undefined, payload: Record<string, unknown>, duplicate: string): Promise<MasterResult> {
  const query = db.from(table as "colors");
  const result = id
    ? await query.update(payload as never).eq("id", id).select("id").maybeSingle()
    : await query.insert(payload as never).select("id").single();
  if (result.error) return failure(result.error, duplicate);
  if (!result.data) return { error: "Registro no encontrado." };
  return { ok: true, id: result.data.id };
}

async function remove(db: Db, table: Table, id: string): Promise<MasterResult> {
  const { data, error } = await db.from(table as "colors").delete().eq("id", id).select("id").maybeSingle();
  if (error) return failure(error, "Ya existe un registro con ese nombre.");
  return data ? { ok: true, id } : { error: "Registro no encontrado." };
}

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
    const data = await getCatalogAdminData();
    if (!data.families.some((row) => row.id === input.familyId)) return { error: "Selecciona una familia de color válida." };
    const current = data.colors.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "Color no encontrado." };
    const duplicate = "Ya existe un color con ese nombre.";
    const repeated = duplicateName(data.colors, input.id, name, (row) => row.name, "un color"); if (repeated) return repeated;
    const slug = slugFor(name, input.slug, current, data.colors); if (slug && typeof slug !== "string") return slug;
    return write(db, "colors", input.id, { name, hex, family_id: input.familyId, is_active: input.isActive, slug,
      ...(!input.id ? { sort_order: nextOrder(data.colors) } : {}) }, duplicate);
  });
}

export async function deleteColor(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó color ${name}`, async (db) => {
    const row = (await getCatalogAdminData()).colors.find((item) => item.id === id);
    if (!row) return { error: "Color no encontrado." };
    name = row.name;
    const used = colorDeleteError(row.variantCount, row.photoCount); if (used) return { error: used };
    return remove(db, "colors", id);
  });
}

export async function saveOptionType(input: OptionTypeInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} tipo de opción ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El nombre"); if (missing) return missing;
    const items = (await getCatalogAdminData()).optionTypes;
    if (input.id && !items.some((row) => row.id === input.id)) return { error: "Tipo de opción no encontrado." };
    const repeated = duplicateName(items, input.id, name, (row) => row.name, "un tipo de opción"); if (repeated) return repeated;
    return write(db, "option_types", input.id, { name, ...(!input.id ? { code: uniqueSlug(name, items.map((row) => row.code)), sort_order: nextOrder(items) } : {}) }, "Ya existe un tipo de opción con ese nombre.");
  });
}

export async function deleteOptionType(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó tipo de opción ${name}`, async (db) => {
    const row = (await getCatalogAdminData()).optionTypes.find((item) => item.id === id);
    if (!row) return { error: "Tipo de opción no encontrado." };
    name = row.name;
    const used = inUseMessage(row.categoryCount, "categorías", false) ?? inUseMessage(row.values.reduce((sum, value) => sum + value.variantCount, 0), "variantes", false);
    if (used) return { error: used };
    if (row.values.length) {
      const { error } = await db.from("option_values").delete().eq("option_type_id", id);
      if (error) return failure(error, "Ya existe un valor con ese nombre.");
    }
    return remove(db, "option_types", id);
  });
}

export async function saveOptionValue(input: OptionValueInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} valor de opción ${input.label.trim()}`, async (db) => {
    const label = input.label.trim(); const missing = required(label, "El valor"); if (missing) return missing;
    const type = (await getCatalogAdminData()).optionTypes.find((row) => row.id === input.optionTypeId);
    if (!type) return { error: "Tipo de opción no encontrado." };
    const current = type.values.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "El valor no pertenece a este tipo de opción." };
    const repeated = duplicateName(type.values, input.id, label, (row) => row.label, "un valor de opción"); if (repeated) return repeated;
    const slug = slugFor(label, input.slug, current, type.values); if (slug && typeof slug !== "string") return slug;
    return write(db, "option_values", input.id, { option_type_id: input.optionTypeId, label, slug, is_active: input.isActive,
      ...(!input.id ? { sort_order: nextOrder(type.values) } : {}) }, "Ya existe un valor de opción con ese nombre.");
  });
}

export async function deleteOptionValue(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó valor de opción ${name}`, async (db) => {
    const row = (await getCatalogAdminData()).optionTypes.flatMap((type) => type.values).find((value) => value.id === id);
    if (!row) return { error: "Valor de opción no encontrado." };
    name = row.label;
    const used = inUseMessage(row.variantCount, "variantes", true); if (used) return { error: used };
    return remove(db, "option_values", id);
  });
}

export async function saveAttribute(input: AttributeInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} característica ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El nombre"); if (missing) return missing;
    const items = (await getCatalogAdminData()).attributes;
    if (input.id && !items.some((row) => row.id === input.id)) return { error: "Característica no encontrada." };
    const repeated = duplicateName(items, input.id, name, (row) => row.name, "una característica"); if (repeated) return repeated;
    return write(db, "attributes", input.id, { name, is_multi: input.isMulti,
      ...(!input.id ? { code: uniqueSlug(name, items.map((row) => row.code)), sort_order: nextOrder(items) } : {}) }, "Ya existe una característica con ese nombre.");
  });
}

export async function deleteAttribute(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó característica ${name}`, async (db) => {
    const row = (await getCatalogAdminData()).attributes.find((item) => item.id === id);
    if (!row) return { error: "Característica no encontrada." };
    name = row.name;
    const used = inUseMessage(row.categoryCount, "categorías", false) ?? inUseMessage(row.values.filter((value) => value.productCount > 0).length, "valores usados en productos", false);
    if (used) return { error: used };
    return remove(db, "attributes", id);
  });
}

export async function saveAttributeValue(input: AttributeValueInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} valor de característica ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El valor"); if (missing) return missing;
    const attribute = (await getCatalogAdminData()).attributes.find((row) => row.id === input.attributeId);
    if (!attribute) return { error: "Característica no encontrada." };
    const current = attribute.values.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "El valor no pertenece a esta característica." };
    const repeated = duplicateName(attribute.values, input.id, name, (row) => row.name, "un valor de característica"); if (repeated) return repeated;
    const slug = slugFor(name, input.slug, current, attribute.values); if (slug && typeof slug !== "string") return slug;
    return write(db, "attribute_values", input.id, { attribute_id: input.attributeId, name, slug, is_active: input.isActive,
      ...(!input.id ? { sort_order: nextOrder(attribute.values) } : {}) }, "Ya existe un valor de característica con ese nombre.");
  });
}

export async function deleteAttributeValue(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó valor de característica ${name}`, async (db) => {
    const row = (await getCatalogAdminData()).attributes.flatMap((attribute) => attribute.values).find((value) => value.id === id);
    if (!row) return { error: "Valor de característica no encontrado." };
    name = row.name;
    const used = inUseMessage(row.productCount, "productos", true); if (used) return { error: used };
    return remove(db, "attribute_values", id);
  });
}

export async function saveCategory(input: CategoryInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} ${input.parentId ? "categoría" : "departamento"} ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El nombre"); if (missing) return missing;
    const data = await getCatalogAdminData();
    const all = data.departments.flatMap((department) => [department, ...department.categories]);
    const current = all.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "Categoría no encontrada." };
    const parent = data.departments.find((row) => row.id === input.parentId);
    if (input.parentId && !all.some((row) => row.id === input.parentId)) return { error: "Departamento no encontrado." };
    const placement = categoryPlacementError({ parentId: input.parentId, parentIsDepartment: !!parent, hasChildren: data.departments.some((row) => row.id === input.id && row.categories.length > 0) });
    if (placement) return { error: placement };
    if (input.id && input.parentId === input.id) return { error: "Un departamento no puede pertenecer a sí mismo." };
    if (!input.isActive && !input.parentId) {
      const activeChildren = data.departments.find((row) => row.id === input.id)?.categories.filter((row) => row.isActive).length ?? 0;
      const deactivation = departmentDeactivationError(activeChildren); if (deactivation) return { error: deactivation };
    }
    const activation = categoryActivationError({ isActive: input.isActive, parentId: input.parentId, parentIsActive: parent?.isActive ?? false });
    if (activation) return { error: activation };
    if (input.parentId && input.optionTypeId && !data.optionTypes.some((row) => row.id === input.optionTypeId)) return { error: "Tipo de opción no encontrado." };
    const selectedAttributes = input.parentId ? input.attributes : [];
    if (!Array.isArray(selectedAttributes) || new Set(selectedAttributes.map((row) => row.attributeId)).size !== selectedAttributes.length || selectedAttributes.some((row) => !data.attributes.some((attribute) => attribute.id === row.attributeId))) return { error: "Las características seleccionadas no son válidas." };
    const repeated = duplicateName(all, input.id, name, (row) => row.name, "una categoría"); if (repeated) return repeated;
    const slug = slugFor(name, input.slug, current, all); if (slug && typeof slug !== "string") return slug;
    const siblings = input.parentId ? parent!.categories : data.departments;
    const result = await write(db, "categories", input.id, { name, slug, parent_id: input.parentId, is_active: input.isActive,
      option_type_id: input.parentId ? input.optionTypeId : null, requires_color: input.parentId ? input.requiresColor : false,
      ...(!input.id ? { color: "#0EA5E9", sort_order: nextOrder(siblings) } : {}) }, "Ya existe una categoría con ese nombre.");
    if (!result?.ok || !result.id) return result;
    // Primero se agregan/actualizan las elegidas y luego se quitan las que sobran: si algo falla a
    // mitad, la categoría queda con características de más, nunca sin ninguna.
    const currentLinks = current && "attributes" in current ? current.attributes.map((row) => row.attributeId) : [];
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
    const data = await getCatalogAdminData();
    const row = data.departments.flatMap((department) => [department, ...department.categories]).find((item) => item.id === id);
    if (!row) return { error: "Categoría no encontrada." };
    name = row.name;
    const children = data.departments.find((department) => department.id === id)?.categories.length ?? 0;
    const used = inUseMessage(row.productCount, "productos", true) ?? inUseMessage(children, "categorías", true);
    if (used) return { error: used };
    return remove(db, "categories", id);
  });
}

export async function saveBrand(input: BrandInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} marca ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El nombre"); if (missing) return missing;
    const items = (await getCatalogAdminData()).brands;
    const current = items.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "Marca no encontrada." };
    const repeated = duplicateName(items, input.id, name, (row) => row.name, "una marca"); if (repeated) return repeated;
    const slug = slugFor(name, input.slug, current, items); if (slug && typeof slug !== "string") return slug;
    return write(db, "brands", input.id, { name, slug, description: input.description?.trim() || null, is_active: input.isActive }, "Ya existe una marca con ese nombre.");
  });
}

export async function deleteBrand(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó marca ${name}`, async (db) => {
    const row = (await getCatalogAdminData()).brands.find((item) => item.id === id);
    if (!row) return { error: "Marca no encontrada." };
    name = row.name;
    const count = Math.max(row.productCount, row.lines.reduce((sum, line) => sum + line.productCount, 0));
    const used = inUseMessage(count, "productos", true); if (used) return { error: used };
    return remove(db, "brands", id);
  });
}

export async function saveLine(input: LineInput): Promise<MasterResult> {
  return execute(`${input.id ? "Actualizó" : "Creó"} línea ${input.name.trim()}`, async (db) => {
    const name = input.name.trim(); const missing = required(name, "El nombre"); if (missing) return missing;
    const brand = (await getCatalogAdminData()).brands.find((row) => row.id === input.brandId);
    if (!brand) return { error: "Marca no encontrada." };
    const current = brand.lines.find((row) => row.id === input.id);
    if (input.id && !current) return { error: "La línea no pertenece a esta marca." };
    const repeated = duplicateName(brand.lines, input.id, name, (row) => row.name, "una línea"); if (repeated) return repeated;
    const slug = slugFor(name, input.slug, current, brand.lines); if (slug && typeof slug !== "string") return slug;
    return write(db, "product_lines", input.id, { brand_id: input.brandId, name, slug, is_active: input.isActive,
      ...(!input.id ? { sort_order: nextOrder(brand.lines) } : {}) }, "Ya existe una línea con ese nombre.");
  });
}

export async function deleteLine(id: string): Promise<MasterResult> {
  let name = id;
  return execute(() => `Eliminó línea ${name}`, async (db) => {
    const row = (await getCatalogAdminData()).brands.flatMap((brand) => brand.lines).find((line) => line.id === id);
    if (!row) return { error: "Línea no encontrada." };
    name = row.name;
    const used = inUseMessage(row.productCount, "productos", true); if (used) return { error: used };
    return remove(db, "product_lines", id);
  });
}

async function reorder(table: "option_values" | "attribute_values" | "categories" | "product_lines", scopeColumn: "option_type_id" | "attribute_id" | "parent_id" | "brand_id", scopeId: string | null, orderedIds: string[]): Promise<MasterResult> {
  let label = "departamentos";
  return execute(() => `Ordenó ${label}`, async (db) => {
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) return { error: "El orden no es válido." };
    const data = await getCatalogAdminData();
    const expected = table === "option_values"
      ? data.optionTypes.find((row) => row.id === scopeId)?.values.map((row) => row.id)
      : table === "attribute_values"
        ? data.attributes.find((row) => row.id === scopeId)?.values.map((row) => row.id)
        : table === "product_lines"
          ? data.brands.find((row) => row.id === scopeId)?.lines.map((row) => row.id)
          : scopeId === null
            ? data.departments.map((row) => row.id)
            : data.departments.find((row) => row.id === scopeId)?.categories.map((row) => row.id);
    label = table === "option_values"
      ? `valores del tipo de opción ${data.optionTypes.find((row) => row.id === scopeId)?.name ?? scopeId}`
      : table === "attribute_values"
        ? `valores de la característica ${data.attributes.find((row) => row.id === scopeId)?.name ?? scopeId}`
        : table === "product_lines"
          ? `líneas de la marca ${data.brands.find((row) => row.id === scopeId)?.name ?? scopeId}`
          : scopeId === null ? "departamentos" : `categorías del departamento ${data.departments.find((row) => row.id === scopeId)?.name ?? scopeId}`;
    if (!expected || orderedIds.length !== expected.length || new Set(orderedIds).size !== expected.length || orderedIds.some((id) => !expected.includes(id))) return { error: "El orden no es válido." };
    for (const [index, id] of orderedIds.entries()) {
      const query = db.from(table).update({ sort_order: index } as never).eq("id", id);
      const { data: updated, error } = await (scopeId === null ? query.is(scopeColumn as "id", null) : query.eq(scopeColumn as "id", scopeId)).select("id").maybeSingle();
      if (error || !updated) return { error: "No se pudo completar el orden." };
    }
    return { ok: true };
  });
}

export async function reorderOptionValues(optionTypeId: string, orderedIds: string[]): Promise<MasterResult> { return reorder("option_values", "option_type_id", optionTypeId, orderedIds); }
export async function reorderAttributeValues(attributeId: string, orderedIds: string[]): Promise<MasterResult> { return reorder("attribute_values", "attribute_id", attributeId, orderedIds); }
export async function reorderCategories(parentId: string | null, orderedIds: string[]): Promise<MasterResult> { return reorder("categories", "parent_id", parentId, orderedIds); }
export async function reorderLines(brandId: string, orderedIds: string[]): Promise<MasterResult> { return reorder("product_lines", "brand_id", brandId, orderedIds); }
