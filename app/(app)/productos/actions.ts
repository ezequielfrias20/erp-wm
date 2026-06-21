"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { skuPrefix, buildSku, nextSeqFromSkus } from "@/lib/sku";

export type FormState = { error?: string; ok?: boolean; id?: string } | null;

type DB = Awaited<ReturnType<typeof createClient>>;

/** Genera un SKU [CAT]-[slug]-[0001] para una nueva variante de `productId`. */
async function generateSku(supabase: DB, productId: string): Promise<string> {
  const { data: product } = await supabase
    .from("products")
    .select("name, category_id")
    .eq("id", productId)
    .maybeSingle();
  let catName: string | null = null;
  if (product?.category_id) {
    const { data: cat } = await supabase
      .from("categories")
      .select("name")
      .eq("id", product.category_id)
      .maybeSingle();
    catName = cat?.name ?? null;
  }
  const prefix = skuPrefix(catName, product?.name);
  const { data: existing } = await supabase
    .from("product_variants")
    .select("sku")
    .like("sku", `${prefix}-%`);
  const seq = nextSeqFromSkus(
    prefix,
    (existing ?? []).map((v) => v.sku),
  );
  return buildSku(catName, product?.name, seq);
}

export async function saveProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "El nombre es obligatorio." };

  const values = {
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    category_id: String(formData.get("category_id") ?? "").trim() || null,
    brand_id: String(formData.get("brand_id") ?? "").trim() || null,
    tax_rate: Number(formData.get("tax_rate") ?? 16),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    visible_in_catalog:
      formData.get("visible_in_catalog") === "on" ||
      formData.get("visible_in_catalog") === "true",
    tags: String(formData.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("products").update(values).eq("id", id);
    if (error) return { error: error.message };
    await audit(`Editó el producto ${name}`, "Productos");
    revalidatePath(`/productos/${id}`);
    revalidatePath("/productos");
    return { ok: true, id };
  } else {
    const { data, error } = await supabase
      .from("products")
      .insert(values)
      .select("id")
      .single();
    if (error) return { error: error.message };
    await audit(`Creó el producto ${name}`, "Productos");
    revalidatePath("/productos");
    return { ok: true, id: data.id };
  }
}

export async function deleteProduct(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("Eliminó un producto", "Productos", "warn");
  revalidatePath("/productos");
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

  const supabase = await createClient();
  // SKU opcional: si no viene, se autogenera [CAT]-[slug]-[0001].
  if (!sku) sku = await generateSku(supabase, productId);

  const values = {
    product_id: productId,
    sku,
    color: String(formData.get("color") ?? "").trim() || null,
    color_hex: String(formData.get("color_hex") ?? "").trim() || null,
    size: String(formData.get("size") ?? "").trim() || null,
    price: Number(formData.get("price") ?? 0),
    cost: Number(formData.get("cost") ?? 0),
  };
  if (id) {
    const { error } = await supabase.from("product_variants").update(values).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("product_variants").insert(values);
    if (error) return { error: error.message };
  }
  await audit(`Actualizó variante ${sku}`, "Productos");
  revalidatePath(`/productos/${productId}`);
  return { ok: true };
}

export async function deleteVariant(
  id: string,
  productId: string,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("product_variants").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("Eliminó una variante", "Productos", "warn");
  revalidatePath(`/productos/${productId}`);
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
