import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId } from "@/lib/branch";
import { canView, canEdit } from "@/lib/permissions";
import { InventarioView } from "@/components/inventario/inventario-view";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { productImageUrl } from "@/lib/product-images";
import type { VInventory } from "@/lib/database.types";

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

  let branchesQuery = supabase.from("branches").select("city, code").order("city");
  if (branchId) branchesQuery = branchesQuery.eq("id", branchId);

  // Opciones para la plantilla de carga masiva.
  const [{ data: allVariants }, { data: allBranches }] = await Promise.all([
    supabase
      .from("product_variants")
      .select("sku, size, color, products(name)")
      .order("sku"),
    branchesQuery,
  ]);
  const skuOptions = (allVariants ?? []).map((v) => {
    const pname = (v.products as { name?: string } | null)?.name ?? "";
    const extra = [v.size, v.color].filter(Boolean).join(" ");
    return `${v.sku} — ${pname}${extra ? ` ${extra}` : ""}`.trim();
  });
  const branchOptions = (allBranches ?? []).map((b) => b.city);

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
      branchLabel={branchLabel}
      canEdit={canEdit(session.permissions, "Inventario")}
    />
  );
}
