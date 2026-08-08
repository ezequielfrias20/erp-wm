import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/pagination";
import type {
  Brand,
  Category,
  Product,
  ProductListItem,
  ProductVariant,
  VInventory,
  VProductSummary,
} from "@/lib/database.types";

export async function listProducts(
  branchId?: string | null,
): Promise<ProductListItem[]> {
  const supabase = await createClient();
  const [products, variants, inventory] = await Promise.all([
    fetchAllRows<VProductSummary>((from, to) =>
      supabase
        .from("v_product_summary")
        .select("*")
        .order("name")
        .range(from, to),
    ),
    fetchAllRows<{
      product_id: string;
      sku: string;
      size: string | null;
      color: string | null;
      color_hex: string | null;
    }>((from, to) =>
      supabase
        .from("product_variants")
        .select("product_id, sku, size, color, color_hex")
        .order("product_id")
        .range(from, to),
    ),
    branchId
      ? fetchAllRows<Pick<VInventory, "product_id" | "quantity">>((from, to) =>
          supabase
            .from("v_inventory")
            .select("product_id, quantity")
            .eq("branch_id", branchId)
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  const sizesByProduct = new Map<string, Set<string>>();
  const colorsByProduct = new Map<string, Map<string, string | null>>();
  const skusByProduct = new Map<string, Set<string>>();
  const stockByProduct = new Map<string, number>();

  for (const variant of variants) {
    const skus = skusByProduct.get(variant.product_id) ?? new Set<string>();
    skus.add(variant.sku);
    skusByProduct.set(variant.product_id, skus);
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
  for (const item of inventory) {
    stockByProduct.set(
      item.product_id,
      (stockByProduct.get(item.product_id) ?? 0) + item.quantity,
    );
  }

  return products.map((product) => ({
    ...product,
    total_stock: branchId
      ? stockByProduct.get(product.id) ?? 0
      : product.total_stock,
    skus: [...(skusByProduct.get(product.id) ?? [])].sort(),
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
    supabase.from("colors").select("id, name, hex").order("name"),
  ]);
  return {
    categories: c.data ?? [],
    brands: b.data ?? [],
    sizes: s.data ?? [],
    colors: col.data ?? [],
  };
}

export type VariantWithStock = ProductVariant & { stock: number };

export async function getProductDetail(
  id: string,
  branchId?: string | null,
): Promise<{
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
  let inventoryQuery = supabase
    .from("v_inventory")
    .select("variant_id, branch_city, quantity")
    .in("variant_id", variantIds);
  if (branchId) {
    inventoryQuery = inventoryQuery.eq("branch_id", branchId);
  }
  const { data: inv } = variantIds.length
    ? await inventoryQuery
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
