"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { skuPrefix, buildSku, nextSeqFromSkus, nextSeqFromSkusAndAliases } from "@/lib/sku";
import type { Product } from "@/lib/database.types";
import { getSession } from "@/lib/queries/session";
import { getCatalogMasters, type CatalogMasters } from "@/lib/queries/catalog";
import { findDuplicate, legacyText, missingCombinations, variantDeleteBlockers, type DeleteBlocker } from "@/lib/catalog/variants";
import { canEdit } from "@/lib/permissions";
import { getProfileBranchScope } from "@/lib/branch";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { inChunks } from "@/lib/chunk";
import { resolveMasterField } from "@/lib/catalog/classification";

export type FormState = { error?: string; ok?: boolean; id?: string; created?: number } | null;

type DB = Awaited<ReturnType<typeof createClient>>;

async function requireProductsEdit(): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." };
  if (!canEdit(session.permissions, "Productos")) {
    return { error: "No tienes permiso para editar productos." };
  }
  return null;
}

type SkuProduct = { name: string; category_id: string | null };

async function nextProductSku(supabase: DB, product: SkuProduct): Promise<{ categoryName: string | null; next: number }> {
  let catName: string | null = null;
  if (product?.category_id) {
    const { data: cat, error: categoryError } = await supabase
      .from("categories")
      .select("name")
      .eq("id", product.category_id)
      .maybeSingle();
    if (categoryError) throw new Error(categoryError.message);
    catName = cat?.name ?? null;
  }
  const prefix = skuPrefix(catName, product.name);
  const [existing, aliases] = await Promise.all([
    fetchAllRows<{ sku: string }>((from, to) => supabase.from("product_variants").select("sku").like("sku", `${prefix}-%`).order("sku").range(from, to)),
    fetchAllRows<{ sku: string }>((from, to) => supabase.from("variant_sku_aliases").select("sku").like("sku", `${prefix}-%`).order("sku").range(from, to)),
  ]);
  return {
    categoryName: catName,
    next: nextSeqFromSkusAndAliases(prefix, existing.map((v) => v.sku), aliases.map((v) => v.sku)),
  };
}

/** Genera un SKU [CAT]-[slug]-[0001] para una nueva variante de `productId`. */
async function generateSku(supabase: DB, productId: string): Promise<string> {
  const { data: product, error } = await supabase.from("products").select("name, category_id").eq("id", productId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) throw new Error("Producto no encontrado.");
  const { categoryName, next } = await nextProductSku(supabase, product);
  return buildSku(categoryName, product.name, next);
}

function revalidateProductPaths(id: string): void {
  revalidatePath(`/productos/${id}`);
  revalidatePath("/productos");
  revalidatePath("/inventario");
  revalidatePath("/ventas");
}

function categoryFromMasters(masters: CatalogMasters, id: string | null) {
  return masters.categories.find((category) => category.id === id) ?? null;
}

export async function createProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "").trim();
  const brandId = String(formData.get("brand_id") ?? "").trim();
  if (!name) return { error: "El nombre es obligatorio." };
  if (!categoryId) return { error: "La categoría es obligatoria." };
  if (!brandId) return { error: "La marca es obligatoria." };
  const guard = await requireProductsEdit();
  if (guard?.error) return guard;

  const masters = await getCatalogMasters();
  if (!categoryFromMasters(masters, categoryId)) return { error: "Selecciona una categoría de segundo nivel válida." };
  if (!masters.brands.some((brand) => brand.id === brandId)) return { error: "Selecciona una marca válida." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").insert({ name, category_id: categoryId, brand_id: brandId }).select("id").single();
  if (error) return { error: error.message };
  await audit(`Creó el producto ${name}`, "Productos");
  revalidateProductPaths(data.id);
  return { ok: true, id: data.id };
}

export async function saveProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return createProduct(_prev, formData);
  const guard = await requireProductsEdit();
  if (guard?.error) return guard;

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("products").select("name, category_id, brand_id, line_id").eq("id", id).maybeSingle();
  if (readError) return { error: readError.message };
  if (!current) return { error: "Producto no encontrado." };
  const masters = await getCatalogMasters();
  const values: Partial<Product> = {};
  const field = (name: string) => String(formData.get(name) ?? "").trim();

  if (formData.has("name")) {
    if (!field("name")) return { error: "El nombre es obligatorio." };
    values.name = field("name");
  }
  if (formData.has("description")) values.description = field("description") || null;
  // Un valor que no cambió no se valida ni se escribe: un maestro inactivo (o un departamento)
  // no se pierde al guardar otra cosa del producto.
  if (formData.has("category_id")) {
    const result = resolveMasterField(field("category_id") || null, current.category_id, (categoryId) => Boolean(categoryFromMasters(masters, categoryId)));
    if (!result.ok) return { error: "Selecciona una categoría de segundo nivel válida." };
    if (result.write) values.category_id = result.value;
  }
  if (formData.has("brand_id")) {
    const result = resolveMasterField(field("brand_id") || null, current.brand_id, (brandId) => masters.brands.some((brand) => brand.id === brandId));
    if (!result.ok) return { error: "Selecciona una marca válida." };
    if (result.write) values.brand_id = result.value;
  }
  const brandId = values.brand_id !== undefined ? values.brand_id : current.brand_id;
  const brandChanged = brandId !== current.brand_id;
  if (formData.has("line_id")) {
    const result = resolveMasterField(
      field("line_id") || null,
      brandChanged ? null : current.line_id,
      (lineId) => Boolean(masters.brands.find((brand) => brand.id === brandId)?.lines.some((line) => line.id === lineId)),
    );
    if (!result.ok) return { error: "La línea debe pertenecer a la marca seleccionada." };
    if (result.write) values.line_id = result.value;
    else if (brandChanged) values.line_id = null;
  } else if (brandChanged) {
    // Una línea anterior no puede quedar vinculada a otra marca.
    values.line_id = null;
  }
  if (formData.has("tax_rate")) {
    const taxRate = Number(field("tax_rate"));
    if (!Number.isFinite(taxRate) || taxRate < 0) return { error: "La tasa de impuesto no es válida." };
    values.tax_rate = taxRate;
  }
  if (formData.has("is_active")) values.is_active = ["on", "true"].includes(field("is_active"));
  if (formData.has("visible_in_catalog")) values.visible_in_catalog = ["on", "true"].includes(field("visible_in_catalog"));
  if (formData.has("tags")) values.tags = field("tags").split(",").map((tag) => tag.trim()).filter(Boolean);
  if (formData.has("specs")) {
    let specs: unknown;
    try { specs = JSON.parse(field("specs")); } catch { return { error: "La ficha técnica no es válida." }; }
    if (!Array.isArray(specs) || specs.some((item) => item === null || typeof item !== "object" || typeof item.label !== "string" || typeof item.value !== "string")) {
      return { error: "La ficha técnica no es válida." };
    }
    values.specs = specs
      .map((item: { label: string; value: string }) => ({ label: item.label.trim(), value: item.value.trim() }))
      .filter((item) => item.label);
  }

  // Sólo el editor nuevo manda «attributes_submitted»: un formulario que trae la categoría pero no
  // las características (el editor viejo, otra pantalla) no debe borrarlas.
  // Tampoco se reemplazan si la categoría (sin cambiar) no está entre los maestros: no se sabe qué
  // características le corresponden y se borrarían todas.
  const categoryId = (values.category_id !== undefined ? values.category_id : current.category_id) ?? null;
  const replaceAttributes = formData.has("attributes_submitted") && (categoryId === null || Boolean(categoryFromMasters(masters, categoryId)));
  let attributeValueIds: string[] = [];
  if (replaceAttributes) {
    const allowedAttributeIds = new Set(categoryFromMasters(masters, categoryId)?.attributes.map((attribute) => attribute.attributeId) ?? []);
    const requestedIds = [...new Set(formData.getAll("attribute_value_ids").map((entry) => String(entry).trim()).filter(Boolean))];
    if (requestedIds.length) {
      const { data: selectedValues, error: valueError } = await supabase.from("attribute_values").select("id, attribute_id").in("id", requestedIds);
      if (valueError) return { error: valueError.message };
      attributeValueIds = (selectedValues ?? []).filter((value) => allowedAttributeIds.has(value.attribute_id)).map((value) => value.id);
    }
  }

  if (Object.keys(values).length) {
    const { error } = await supabase.from("products").update(values).eq("id", id);
    if (error) return { error: error.message };
  }
  if (replaceAttributes) {
    const { error: deleteError } = await supabase.from("product_attribute_values").delete().eq("product_id", id);
    if (deleteError) return { error: deleteError.message };
    if (attributeValueIds.length) {
      const { error: insertError } = await supabase.from("product_attribute_values").insert(attributeValueIds.map((attribute_value_id) => ({ product_id: id, attribute_value_id })));
      if (insertError) return { error: insertError.message };
    }
  }
  await audit(`Editó el producto ${String(values.name ?? current.name)}`, "Productos");
  revalidateProductPaths(id);
  return { ok: true, id };
}

async function deletionBlockers(supabase: DB, variantIds: string[]): Promise<DeleteBlocker[]> {
  if (!variantIds.length) return [];
  // Por grupos de 100 ids: con cientos de variantes la URL del filtro «in» se vuelve demasiado larga.
  const count = (table: "sale_items" | "purchase_order_items" | "variant_sku_aliases") =>
    inChunks(variantIds, async (part) => {
      const { count: rows, error } = await supabase.from(table).select("variant_id", { count: "exact", head: true }).in("variant_id", part);
      if (error) throw new Error(error.message);
      return [rows ?? 0];
    }).then((counts) => counts.reduce((sum, value) => sum + value, 0));
  const [saleLines, purchaseLines, inventory, aliases] = await Promise.all([
    count("sale_items"),
    count("purchase_order_items"),
    inChunks(variantIds, (part) => fetchAllRows<{ quantity: number }>((from, to) => supabase.from("inventory").select("quantity").in("variant_id", part).order("id").range(from, to))),
    count("variant_sku_aliases"),
  ]);
  return variantDeleteBlockers({
    saleLines,
    purchaseLines,
    stock: inventory.reduce((sum, row) => sum + Math.max(0, row.quantity), 0),
    aliases,
  });
}

const blockerLabels: Record<DeleteBlocker, string> = {
  sales: "ventas", purchases: "compras", stock: "stock", aliases: "SKU anteriores",
};

function deletionError(blockers: DeleteBlocker[], product = false): string {
  return `No se puede borrar: tiene ${blockers.map((blocker) => blockerLabels[blocker]).join(", ")}. ${product ? "Desactívalo" : "Desactívala"} en su lugar.`;
}

export async function deleteProduct(id: string): Promise<FormState> {
  const guard = await requireProductsEdit();
  if (guard?.error) return guard;
  const supabase = await createClient();
  const { data: product, error: productError } = await supabase.from("products").select("id, name").eq("id", id).maybeSingle();
  if (productError) return { error: productError.message };
  if (!product) return { error: "Producto no encontrado." };
  const variants = await fetchAllRows<{ id: string }>((from, to) => supabase.from("product_variants").select("id").eq("product_id", id).order("id").range(from, to));
  const blockers = await deletionBlockers(supabase, variants.map((variant) => variant.id));
  if (blockers.length) return { error: deletionError(blockers, true) };
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit(`Eliminó el producto ${product.name}`, "Productos", "warn");
  revalidateProductPaths(id);
  return { ok: true };
}

export async function saveVariant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();
  let sku = String(formData.get("sku") ?? "").trim();
  if (!productId) return { error: "El producto es obligatorio." };
  const guard = await requireProductsEdit();
  if (guard?.error) return guard;

  const supabase = await createClient();
  const [{ data: product, error: productError }, { data: current, error: currentError }, masters] = await Promise.all([
    supabase.from("products").select("name, category_id").eq("id", productId).maybeSingle(),
    id ? supabase.from("product_variants").select("id, sku, is_active").eq("id", id).eq("product_id", productId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    getCatalogMasters(),
  ]);
  if (productError) return { error: productError.message };
  if (currentError) return { error: currentError.message };
  if (!product) return { error: "Producto no encontrado." };
  if (id && !current) return { error: "Variante no encontrada." };
  const category = categoryFromMasters(masters, product.category_id);
  if (!category) return { error: "Selecciona una categoría de segundo nivel válida." };
  const colorId = String(formData.get("color_id") ?? "").trim() || null;
  const optionValueId = String(formData.get("option_value_id") ?? "").trim() || null;
  const color = colorId ? masters.colors.find((item) => item.id === colorId) ?? null : null;
  const option = optionValueId
    ? masters.optionTypes.find((type) => type.id === category.optionTypeId)?.values.find((value) => value.id === optionValueId) ?? null
    : null;
  if (colorId && !color) return { error: "Selecciona un color activo válido." };
  if (category.requiresColor && !color) return { error: "El color es obligatorio para esta categoría." };
  if (category.optionTypeId && !option) return { error: "Selecciona una opción válida para esta categoría." };
  if (!category.optionTypeId && optionValueId) return { error: "Esta categoría no admite opciones." };
  const price = Number(formData.get("price") ?? 0);
  const cost = Number(formData.get("cost") ?? 0);
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(cost) || cost < 0) return { error: "El precio y el costo deben ser números no negativos." };

  const existing = await fetchAllRows<{ id: string; sku: string; color_id: string | null; option_value_id: string | null }>((from, to) =>
    supabase.from("product_variants").select("id, sku, color_id, option_value_id").eq("product_id", productId).order("id").range(from, to));
  const duplicate = findDuplicate(existing.map((variant) => ({
    id: variant.id, sku: variant.sku, colorId: variant.color_id, optionValueId: variant.option_value_id,
  })), { id: id || undefined, colorId, optionValueId });
  if (duplicate) return { error: `Ya existe una variante con ese color y opción: ${duplicate.sku}.` };

  if (!sku) sku = current?.sku ?? await generateSku(supabase, productId);
  const { data: alias, error: aliasError } = await supabase.from("variant_sku_aliases").select("sku").eq("sku", sku).maybeSingle();
  if (aliasError) return { error: aliasError.message };
  if (alias) return { error: "El SKU está reservado como SKU anterior." };

  const values = {
    product_id: productId, sku, color_id: colorId, option_value_id: optionValueId,
    ...legacyText(color, option), price, cost,
    is_active: formData.has("is_active")
      ? ["on", "true"].includes(String(formData.get("is_active")))
      : current?.is_active ?? true,
  };
  if (id) {
    const { error } = await supabase.from("product_variants").update(values).eq("id", id).eq("product_id", productId);
    if (error) return { error: error.message };
  } else {
    const stockFields = [...formData.entries()].filter(([key]) => key.startsWith("stock:"));
    const session = await getSession();
    const canWriteStock = session && canEdit(session.permissions, "Inventario");
    const stockRows: { branch_id: string; quantity: number; reserved: number; min_stock: number }[] = [];
    if (canWriteStock && stockFields.length) {
      const assignedBranchId = getProfileBranchScope(session.profile);
      const branchIds = new Set<string>();
      for (const [key, raw] of stockFields) {
        const branchId = key.slice("stock:".length);
        const quantity = Number(raw);
        if (!branchId || (assignedBranchId && branchId !== assignedBranchId)) return { error: "No puedes crear inventario en otra sucursal." };
        if (!Number.isInteger(quantity) || quantity < 0) return { error: "El stock inicial debe ser un entero no negativo." };
        if (branchIds.has(branchId)) return { error: "La sucursal está repetida en el stock inicial." };
        branchIds.add(branchId);
        stockRows.push({ branch_id: branchId, quantity, reserved: 0, min_stock: 0 });
      }
      const { data: branches, error: branchError } = await supabase.from("branches").select("id").in("id", [...branchIds]);
      if (branchError) return { error: branchError.message };
      if ((branches ?? []).length !== branchIds.size) return { error: "La sucursal seleccionada no existe." };
    }
    const { data: created, error } = await supabase.from("product_variants").insert(values).select("id").single();
    if (error) return { error: error.message };
    if (stockRows.length) {
      const { error: stockError } = await supabase.from("inventory").insert(stockRows.map((row) => ({ ...row, variant_id: created.id })));
      if (stockError) {
        await supabase.from("product_variants").delete().eq("id", created.id);
        return { error: stockError.message };
      }
    }
  }
  await audit(`Actualizó variante ${sku}`, "Productos");
  revalidateProductPaths(productId);
  return { ok: true };
}

export async function generateVariants(input: {
  productId: string;
  colorIds: (string | null)[];
  optionValueIds: (string | null)[];
  price: number;
  cost: number;
}): Promise<FormState> {
  const guard = await requireProductsEdit();
  if (guard?.error) return guard;
  if (!input.productId) return { error: "El producto es obligatorio." };
  if (!input.colorIds.length || !input.optionValueIds.length) return { error: "Selecciona colores y opciones para generar variantes." };
  if (input.colorIds.length * input.optionValueIds.length > 300) return { error: "No puedes generar más de 300 combinaciones por vez." };
  if (!Number.isFinite(input.price) || input.price < 0 || !Number.isFinite(input.cost) || input.cost < 0) {
    return { error: "El precio y el costo deben ser números no negativos." };
  }

  const supabase = await createClient();
  const [{ data: product, error: productError }, masters] = await Promise.all([
    supabase.from("products").select("name, category_id").eq("id", input.productId).maybeSingle(),
    getCatalogMasters(),
  ]);
  if (productError) return { error: productError.message };
  if (!product) return { error: "Producto no encontrado." };
  const category = categoryFromMasters(masters, product.category_id);
  if (!category) return { error: "Selecciona una categoría de segundo nivel válida." };
  const colors = new Map(masters.colors.map((color) => [color.id, color]));
  const options = new Map(masters.optionTypes.find((type) => type.id === category.optionTypeId)?.values.map((option) => [option.id, option]) ?? []);
  if (input.colorIds.some((id) => id !== null && !colors.has(id))) return { error: "Selecciona un color activo válido." };
  if (category.requiresColor && input.colorIds.includes(null)) return { error: "El color es obligatorio para esta categoría." };
  if (category.optionTypeId && input.optionValueIds.some((id) => id === null || !options.has(id))) return { error: "Selecciona una opción válida para esta categoría." };
  if (!category.optionTypeId && input.optionValueIds.some((id) => id !== null)) return { error: "Esta categoría no admite opciones." };

  const existing = await fetchAllRows<{ color_id: string | null; option_value_id: string | null }>((from, to) =>
    supabase.from("product_variants").select("color_id, option_value_id").eq("product_id", input.productId).order("id").range(from, to));
  const missing = missingCombinations(existing.map((variant) => ({ colorId: variant.color_id, optionValueId: variant.option_value_id })), input.colorIds, input.optionValueIds);
  if (!missing.length) return { ok: true, created: 0 };
  const { categoryName, next } = await nextProductSku(supabase, product);
  const rows = missing.map((combination, index) => ({
    product_id: input.productId,
    sku: buildSku(categoryName, product.name, next + index),
    color_id: combination.colorId,
    option_value_id: combination.optionValueId,
    ...legacyText(combination.colorId ? colors.get(combination.colorId) ?? null : null, combination.optionValueId ? options.get(combination.optionValueId) ?? null : null),
    price: input.price,
    cost: input.cost,
  }));
  const { error } = await supabase.from("product_variants").insert(rows);
  if (error) return { error: error.message };
  await audit(`Generó ${rows.length} variantes del producto ${product.name}`, "Productos");
  revalidateProductPaths(input.productId);
  return { ok: true, created: rows.length };
}

export async function deleteVariant(
  id: string,
  productId: string,
): Promise<FormState> {
  const guard = await requireProductsEdit();
  if (guard?.error) return guard;

  const supabase = await createClient();
  const { data: variant, error: readError } = await supabase.from("product_variants").select("id, sku").eq("id", id).eq("product_id", productId).maybeSingle();
  if (readError) return { error: readError.message };
  if (!variant) return { error: "Variante no encontrada." };
  const blockers = await deletionBlockers(supabase, [id]);
  if (blockers.length) return { error: deletionError(blockers) };
  const { error } = await supabase.from("product_variants").delete().eq("id", id).eq("product_id", productId);
  if (error) return { error: error.message };
  await audit(`Eliminó la variante ${variant.sku}`, "Productos", "warn");
  revalidateProductPaths(productId);
  return { ok: true };
}

// ───────────────────────── Carga masiva (Excel) ─────────────────────────

export type ProductImportRow = {
  name?: string;
  category?: string;
  brand?: string;
  tax_rate?: string | number;
  visible?: string | boolean;
  description?: string;
};

export type VariantImportRow = {
  product?: string;
  size?: string;
  color?: string;
  price?: string | number;
  cost?: string | number;
  sku?: string;
  barcode?: string;
};

export type ImportProductsResult = {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  skipped: number;
  errors: string[];
};

const s = (v: unknown): string => (v == null ? "" : String(v).trim());
const lc = (v: unknown): string => s(v).toLowerCase();
function parseBool(v: unknown, dflt: boolean): boolean {
  const t = lc(v);
  if (!t) return dflt;
  return ["sí", "si", "true", "1", "x", "yes", "y"].includes(t);
}
const variantKey = (productId: string, size: string | null, color: string | null) =>
  `${productId}|${(size ?? "").toLowerCase()}|${(color ?? "").toLowerCase()}`;

export async function importProducts(input: {
  products: ProductImportRow[];
  variants: VariantImportRow[];
}): Promise<ImportProductsResult> {
  const guard = await requireProductsEdit();
  if (guard?.error) {
    return {
      productsCreated: 0,
      productsUpdated: 0,
      variantsCreated: 0,
      variantsUpdated: 0,
      skipped: input.products.length + input.variants.length,
      errors: [guard.error],
    };
  }

  const supabase = await createClient();
  const res: ImportProductsResult = {
    productsCreated: 0,
    productsUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
    skipped: 0,
    errors: [],
  };

  const [catRes, brandRes, colorRes] = await Promise.all([
    supabase.from("categories").select("id, name"),
    supabase.from("brands").select("id, name"),
    supabase.from("colors").select("name, hex"),
  ]);
  const catByName = new Map((catRes.data ?? []).map((c) => [lc(c.name), c]));
  const catById = new Map((catRes.data ?? []).map((c) => [c.id, c.name]));
  const brandByName = new Map((brandRes.data ?? []).map((b) => [lc(b.name), b]));
  const colorByName = new Map((colorRes.data ?? []).map((c) => [lc(c.name), c.hex]));

  const { data: existingProducts } = await supabase
    .from("products")
    .select("id, name, category_id");
  const productByName = new Map(
    (existingProducts ?? []).map((p) => [
      lc(p.name),
      { id: p.id, category_id: p.category_id as string | null },
    ]),
  );

  // ── Productos
  for (const row of input.products) {
    const name = s(row.name);
    if (!name) {
      res.skipped++;
      continue;
    }
    const cat = row.category ? catByName.get(lc(row.category)) : undefined;
    const brand = row.brand ? brandByName.get(lc(row.brand)) : undefined;
    if (s(row.category) && !cat)
      res.errors.push(`Categoría no encontrada: "${s(row.category)}" (producto ${name})`);
    if (s(row.brand) && !brand)
      res.errors.push(`Marca no encontrada: "${s(row.brand)}" (producto ${name})`);

    const values = {
      name,
      category_id: cat?.id ?? null,
      brand_id: brand?.id ?? null,
      tax_rate: s(row.tax_rate) ? Number(row.tax_rate) : 16,
      visible_in_catalog: parseBool(row.visible, true),
      description: s(row.description) || null,
    };

    const existing = productByName.get(lc(name));
    if (existing) {
      const { error } = await supabase.from("products").update(values).eq("id", existing.id);
      if (error) {
        res.errors.push(`Producto ${name}: ${error.message}`);
        continue;
      }
      productByName.set(lc(name), { id: existing.id, category_id: values.category_id });
      res.productsUpdated++;
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert(values)
        .select("id")
        .single();
      if (error) {
        res.errors.push(`Producto ${name}: ${error.message}`);
        continue;
      }
      productByName.set(lc(name), { id: data.id, category_id: values.category_id });
      res.productsCreated++;
    }
  }

  // ── Variantes
  const { data: allVariants } = await supabase
    .from("product_variants")
    .select("id, product_id, sku, size, color");
  const variantByKey = new Map<string, string>();
  for (const v of allVariants ?? [])
    variantByKey.set(variantKey(v.product_id, v.size, v.color), v.id);

  const allSkus = (allVariants ?? []).map((v) => v.sku);
  const seqByPrefix = new Map<string, number>();
  const nextSeq = (prefix: string): number => {
    if (!seqByPrefix.has(prefix))
      seqByPrefix.set(prefix, nextSeqFromSkus(prefix, allSkus) - 1);
    const n = (seqByPrefix.get(prefix) ?? 0) + 1;
    seqByPrefix.set(prefix, n);
    return n;
  };

  for (const row of input.variants) {
    const pname = s(row.product);
    if (!pname) {
      res.skipped++;
      continue;
    }
    const prod = productByName.get(lc(pname));
    if (!prod) {
      res.errors.push(`Variante omitida: producto no encontrado "${pname}"`);
      res.skipped++;
      continue;
    }
    const size = s(row.size) || null;
    const color = s(row.color) || null;
    const color_hex = color ? (colorByName.get(lc(color)) ?? null) : null;
    const price = s(row.price) ? Number(row.price) : 0;
    const cost = s(row.cost) ? Number(row.cost) : 0;
    const key = variantKey(prod.id, size, color);
    const existingId = variantByKey.get(key);

    if (existingId) {
      const { error } = await supabase
        .from("product_variants")
        .update({ price, cost, color, color_hex, size, barcode: s(row.barcode) || null })
        .eq("id", existingId);
      if (error) {
        res.errors.push(`Variante ${pname}/${size}/${color}: ${error.message}`);
        continue;
      }
      res.variantsUpdated++;
    } else {
      let sku = s(row.sku);
      if (!sku) {
        const catName = prod.category_id ? (catById.get(prod.category_id) ?? null) : null;
        const prefix = skuPrefix(catName, pname);
        sku = buildSku(catName, pname, nextSeq(prefix));
        allSkus.push(sku);
      }
      const { data, error } = await supabase
        .from("product_variants")
        .insert({
          product_id: prod.id,
          sku,
          size,
          color,
          color_hex,
          price,
          cost,
          barcode: s(row.barcode) || null,
        })
        .select("id")
        .single();
      if (error) {
        res.errors.push(`Variante ${pname}/${size}/${color} (${sku}): ${error.message}`);
        continue;
      }
      variantByKey.set(key, data.id);
      res.variantsCreated++;
    }
  }

  await audit(
    `Importó catálogo: ${res.productsCreated} prod. nuevos, ${res.variantsCreated} variantes nuevas`,
    "Productos",
  );
  revalidatePath("/productos");
  revalidatePath("/inventario");
  return res;
}

export async function getProductsExport(): Promise<{
  products: Record<string, unknown>[];
  variants: Record<string, unknown>[];
}> {
  const guard = await requireProductsEdit();
  if (guard?.error) return { products: [], variants: [] };

  const supabase = await createClient();
  const [{ data: products }, { data: cats }, { data: brands }, { data: variants }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, tax_rate, visible_in_catalog, description, category_id, brand_id")
        .order("name"),
      supabase.from("categories").select("id, name"),
      supabase.from("brands").select("id, name"),
      supabase
        .from("product_variants")
        .select("product_id, sku, size, color, price, cost, barcode")
        .order("sku"),
    ]);
  const catById = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const brandById = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const prodById = new Map((products ?? []).map((p) => [p.id, p.name]));

  return {
    products: (products ?? []).map((p) => ({
      name: p.name,
      category: p.category_id ? (catById.get(p.category_id) ?? "") : "",
      brand: p.brand_id ? (brandById.get(p.brand_id) ?? "") : "",
      tax_rate: p.tax_rate,
      visible: p.visible_in_catalog ? "Sí" : "No",
      description: p.description ?? "",
    })),
    variants: (variants ?? []).map((v) => ({
      product: prodById.get(v.product_id) ?? "",
      size: v.size ?? "",
      color: v.color ?? "",
      price: v.price,
      cost: v.cost,
      sku: v.sku,
      barcode: v.barcode ?? "",
    })),
  };
}
