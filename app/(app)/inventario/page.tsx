import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId } from "@/lib/branch";
import { canView, canEdit } from "@/lib/permissions";
import {
  InventarioView,
  type InventoryBranchOption,
  type InventoryVariantOption,
} from "@/components/inventario/inventario-view";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { productImageUrl } from "@/lib/product-images";
import type {
  Branch,
  Brand,
  Category,
  Product,
  ProductVariant,
  VInventory,
} from "@/lib/database.types";

export const metadata = { title: "Inventario · World Medics ERP" };

export default async function InventarioPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Inventario")) redirect("/dashboard");

  const supabase = await createClient();
  const branchId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );

  const list = await fetchAllRows<VInventory>((from, to) => {
    let query = supabase.from("v_inventory").select("*");
    if (branchId) query = query.eq("branch_id", branchId);
    return query.order("product_name").range(from, to);
  });
  const productIds = [...new Set(list.map((row) => row.product_id))];
  const { data: productVersions } = productIds.length
    ? await supabase
        .from("products")
        .select("id, updated_at")
        .in("id", productIds)
    : { data: [] as { id: string; updated_at: string }[] };
  const versionByProduct = new Map(
    (productVersions ?? []).map((product) => [product.id, product.updated_at]),
  );
  const rows = list.map((row) => ({
    ...row,
    product_image_url: productImageUrl(row.product_id, versionByProduct.get(row.product_id)),
  }));
  const categories = [
    ...new Set(list.map((r) => r.category).filter(Boolean)),
  ] as string[];
  const brands = [
    ...new Set(list.map((r) => r.brand).filter(Boolean)),
  ] as string[];

  // Opciones para la plantilla y para crear inventario de variantes sin stock.
  const [allVariants, allBranches] = await Promise.all([
    fetchAllRows<
      Pick<
        ProductVariant,
        "id" | "product_id" | "sku" | "size" | "color" | "color_hex" | "is_active"
      >
    >((from, to) =>
      supabase
        .from("product_variants")
        .select("id, product_id, sku, size, color, color_hex, is_active")
        .order("sku")
        .range(from, to),
    ),
    fetchAllRows<Pick<Branch, "id" | "city" | "code">>((from, to) => {
      let query = supabase.from("branches").select("id, city, code").order("city");
      if (branchId) query = query.eq("id", branchId);
      return query.range(from, to);
    }),
  ]);

  const allProductIds = [...new Set(allVariants.map((variant) => variant.product_id))];
  const variantProducts = allProductIds.length
    ? await fetchAllRows<
        Pick<Product, "id" | "name" | "category_id" | "brand_id" | "is_active">
      >((from, to) =>
        supabase
          .from("products")
          .select("id, name, category_id, brand_id, is_active")
          .in("id", allProductIds)
          .range(from, to),
      )
    : [];
  const [categoryRefs, brandRefs] = await Promise.all([
    fetchAllRows<Pick<Category, "id" | "name">>((from, to) =>
      supabase.from("categories").select("id, name").range(from, to),
    ),
    fetchAllRows<Pick<Brand, "id" | "name">>((from, to) =>
      supabase.from("brands").select("id, name").range(from, to),
    ),
  ]);
  const productById = new Map(variantProducts.map((product) => [product.id, product]));
  const categoryById = new Map(categoryRefs.map((category) => [category.id, category.name]));
  const brandById = new Map(brandRefs.map((brand) => [brand.id, brand.name]));
  const variantOptions: InventoryVariantOption[] = allVariants
    .filter((variant) => {
      const product = productById.get(variant.product_id);
      return variant.is_active && product?.is_active;
    })
    .map((variant) => {
      const product = productById.get(variant.product_id);
      return {
        id: variant.id,
        product_id: variant.product_id,
        sku: variant.sku,
        product_name: product?.name ?? "",
        category: product?.category_id ? categoryById.get(product.category_id) ?? null : null,
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
  const branchOptions = allBranches.map((b) => b.city);
  const inventoryBranches: InventoryBranchOption[] = allBranches.map((branch) => ({
    id: branch.id,
    city: branch.city,
    code: branch.code,
  }));

  let branchLabel = "5 sucursales";
  if (branchId) {
    const { data: b } = await supabase
      .from("branches")
      .select("city")
      .eq("id", branchId)
      .maybeSingle();
    if (b) branchLabel = b.city;
  }

  return (
    <InventarioView
      rows={rows}
      categories={categories.sort()}
      brands={brands.sort()}
      skuOptions={skuOptions}
      branchOptions={branchOptions}
      variantOptions={variantOptions}
      inventoryBranches={inventoryBranches}
      branchLabel={branchLabel}
      canEdit={canEdit(session.permissions, "Inventario")}
    />
  );
}
