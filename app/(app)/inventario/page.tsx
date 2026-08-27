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

  // Antes esto eran seis pasos en serie (~3.3 s medidos) porque cada consulta
  // filtraba por los ids de la anterior. Ahora son tres independientes en paralelo:
  // el catálogo de variantes y sucursales, que sólo hace falta para la plantilla y
  // el alta de stock, se pide bajo demanda (ver `loadInventoryOptions`).
  const [list, productVersions, branchRow] = await Promise.all([
    fetchAllRows<VInventory>((from, to) => {
      let query = supabase.from("v_inventory").select("*");
      if (branchId) query = query.eq("branch_id", branchId);
      return query.order("product_name").range(from, to);
    }),
    fetchAllRows<{ id: string; updated_at: string }>((from, to) =>
      supabase.from("products").select("id, updated_at").range(from, to),
    ),
    branchId
      ? supabase.from("branches").select("city").eq("id", branchId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const versionByProduct = new Map(
    productVersions.map((product) => [product.id, product.updated_at]),
  );
  const rows = list.map((row) => ({
    ...row,
    product_image_url: productImageUrl(
      row.product_id,
      versionByProduct.get(row.product_id),
    ),
  }));
  const categories = [
    ...new Set(list.map((r) => r.category).filter(Boolean)),
  ] as string[];
  const brands = [
    ...new Set(list.map((r) => r.brand).filter(Boolean)),
  ] as string[];

  return (
    <InventarioView
      rows={rows}
      categories={categories.sort()}
      brands={brands.sort()}
      branchLabel={branchRow.data?.city ?? "5 sucursales"}
      canEdit={canEdit(session.permissions, "Inventario")}
    />
  );
}
