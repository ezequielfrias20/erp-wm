import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/pagination";
import type {
  Brand,
  Category,
  Product,
  ProductListItem,
  ProductVariant,
  VProductSummary,
} from "@/lib/database.types";

export async function listProducts(): Promise<ProductListItem[]> {
  const supabase = await createClient();
  const [products, variants] = await Promise.all([
    fetchAllRows<VProductSummary>((from, to) =>
      supabase
        .from("v_product_summary")
        .select("*")
        .order("name")
        .range(from, to),
    ),
    fetchAllRows<{
      product_id: string;
      size: string | null;
      color: string | null;
      color_hex: string | null;
    }>((from, to) =>
      supabase
        .from("product_variants")
        .select("product_id, size, color, color_hex")
        .order("product_id")
        .range(from, to),
    ),
  ]);

  const sizesByProduct = new Map<string, Set<string>>();
  const colorsByProduct = new Map<string, Map<string, string | null>>();

  for (const variant of variants) {
    if (variant.size) {
      const sizes = sizesByProduct.get(variant.product_id) ?? new Set<string>();
      sizes.add(variant.size);
      sizesByProduct.set(variant.product_id, sizes);
    }
    if (variant.color) {
      const colors =
        colorsByProduct.get(variant.product_id) ?? new Map<string, string | null>();
      colors.set(variant.color, variant.color_hex);
      colorsByProduct.set(variant.product_id, colors);
    }
  }

  return products.map((product) => ({
    ...product,
    sizes: [...(sizesByProduct.get(product.id) ?? [])].sort(),
    colors: [...(colorsByProduct.get(product.id) ?? [])]
      .map(([name, hex]) => ({ name, hex }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export async function getCatalogRefs(): Promise<{
  categories: Pick<Category, "id" | "name" | "color">[];
  brands: Pick<Brand, "id" | "name">[];
  sizes: { id: string; label: string }[];
  colors: { id: string; name: string; hex: string | null }[];
}> {
  const supabase = await createClient();
  const [c, b, s, col] = await Promise.all([
    supabase.from("categories").select("id, name, color").order("sort_order"),
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("sizes").select("id, label").order("sort_order"),
    supabase.from("colors").select("id, name, hex").order("sort_order"),
  ]);
  return {
    categories: c.data ?? [],
    brands: b.data ?? [],
    sizes: s.data ?? [],
    colors: col.data ?? [],
  };
}

export type VariantWithStock = ProductVariant & { stock: number };

export async function getProductDetail(id: string): Promise<{
  product: Product | null;
  variants: VariantWithStock[];
  byBranch: { city: string; qty: number }[];
} | null> {
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!product) return null;

  const { data: variants } = await supabase
    .from("product_variants")
    .select("*")
    .eq("product_id", id)
    .order("sku");

  const variantIds = (variants ?? []).map((v) => v.id);
  const { data: inv } = variantIds.length
    ? await supabase
        .from("v_inventory")
        .select("variant_id, branch_city, quantity")
        .in("variant_id", variantIds)
    : { data: [] as { variant_id: string; branch_city: string; quantity: number }[] };

  const stockByVariant = new Map<string, number>();
  const stockByCity = new Map<string, number>();
  for (const row of inv ?? []) {
    stockByVariant.set(
      row.variant_id,
      (stockByVariant.get(row.variant_id) ?? 0) + row.quantity,
    );
    stockByCity.set(
      row.branch_city,
      (stockByCity.get(row.branch_city) ?? 0) + row.quantity,
    );
  }

  return {
    product,
    variants: (variants ?? []).map((v) => ({
      ...v,
      stock: stockByVariant.get(v.id) ?? 0,
    })),
    byBranch: [...stockByCity.entries()].map(([city, qty]) => ({ city, qty })),
  };
}
