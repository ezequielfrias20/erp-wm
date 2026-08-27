import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/pagination";
import type { Branch, Brand, Category, Product, ProductVariant } from "@/lib/database.types";

import type {
  InventoryBranchOption,
  InventoryOptions,
  InventoryVariantOption,
} from "@/lib/inventory-options";

export type { InventoryBranchOption, InventoryOptions, InventoryVariantOption };

/**
 * Catálogo completo de variantes y sucursales para la plantilla de carga masiva y
 * para dar de alta inventario de una variante sin stock.
 *
 * Se pedía en cada carga de /inventario —cuatro consultas y ~235 KB de JSON en el
 * payload— aunque sólo hacen falta al abrir el diálogo o al bajar la plantilla.
 * Ahora se resuelve bajo demanda desde el cliente.
 */
export async function getInventoryOptions(
  branchId: string | null,
): Promise<InventoryOptions> {
  const supabase = await createClient();

  const [variants, branches, products, categories, brands] = await Promise.all([
    fetchAllRows<
      Pick<
        ProductVariant,
        "id" | "product_id" | "sku" | "size" | "color" | "color_hex" | "is_active"
      >
    >((from, to) =>
      supabase
        .from("product_variants")
        .select("id, product_id, sku, size, color, color_hex, is_active")
        .eq("is_active", true)
        .order("sku")
        .range(from, to),
    ),
    fetchAllRows<Pick<Branch, "id" | "city" | "code">>((from, to) => {
      let query = supabase.from("branches").select("id, city, code").order("city");
      if (branchId) query = query.eq("id", branchId);
      return query.range(from, to);
    }),
    fetchAllRows<Pick<Product, "id" | "name" | "category_id" | "brand_id" | "is_active">>(
      (from, to) =>
        supabase
          .from("products")
          .select("id, name, category_id, brand_id, is_active")
          .eq("is_active", true)
          .range(from, to),
    ),
    fetchAllRows<Pick<Category, "id" | "name">>((from, to) =>
      supabase.from("categories").select("id, name").range(from, to),
    ),
    fetchAllRows<Pick<Brand, "id" | "name">>((from, to) =>
      supabase.from("brands").select("id, name").range(from, to),
    ),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const brandById = new Map(brands.map((b) => [b.id, b.name]));

  const variantOptions: InventoryVariantOption[] = variants
    .filter((variant) => productById.has(variant.product_id))
    .map((variant) => {
      const product = productById.get(variant.product_id);
      return {
        id: variant.id,
        product_id: variant.product_id,
        sku: variant.sku,
        product_name: product?.name ?? "",
        category: product?.category_id
          ? categoryById.get(product.category_id) ?? null
          : null,
        brand: product?.brand_id ? brandById.get(product.brand_id) ?? null : null,
        size: variant.size,
        color: variant.color,
        color_hex: variant.color_hex,
      };
    });

  const skuOptions = variantOptions.map((v) => {
    const extra = [v.size, v.color].filter(Boolean).join(" ");
    return `${v.sku} — ${v.product_name}${extra ? ` ${extra}` : ""}`.trim();
  });

  return {
    variantOptions,
    skuOptions,
    branchOptions: branches.map((b) => b.city),
    inventoryBranches: branches.map((branch) => ({
      id: branch.id,
      city: branch.city,
      code: branch.code,
    })),
  };
}
