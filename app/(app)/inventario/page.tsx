import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId } from "@/lib/branch";
import { canView, canEdit } from "@/lib/permissions";
import { InventarioView } from "@/components/inventario/inventario-view";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { getMainPhotoUrls } from "@/lib/queries/catalog";
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

  // El catálogo completo para la plantilla y el alta de stock se pide bajo demanda
  // (ver `loadInventoryOptions`). Aquí se cargan sólo las existencias visibles.
  const [list, branchRow, mainPhotoUrls, aliases] = await Promise.all([
    fetchAllRows<VInventory>((from, to) => {
      let query = supabase.from("v_inventory").select("*");
      if (branchId) query = query.eq("branch_id", branchId);
      return query.order("product_name").range(from, to);
    }),
    branchId
      ? supabase.from("branches").select("city").eq("id", branchId).maybeSingle()
      : Promise.resolve({ data: null }),
    getMainPhotoUrls(),
    fetchAllRows<{ variant_id: string; sku: string }>((from, to) =>
      supabase.from("variant_sku_aliases").select("variant_id, sku").order("sku").range(from, to),
    ),
  ]);

  const loadedVariantIds = new Set(list.map((row) => row.variant_id));
  const aliasesByVariant = new Map<string, string[]>();
  for (const alias of aliases) {
    if (!loadedVariantIds.has(alias.variant_id)) continue;
    const variantAliases = aliasesByVariant.get(alias.variant_id) ?? [];
    variantAliases.push(alias.sku);
    aliasesByVariant.set(alias.variant_id, variantAliases);
  }
  const rows = list.map((row) => ({
    ...row,
    product_image_url: mainPhotoUrls.get(row.product_id) ?? null,
    aliases: aliasesByVariant.get(row.variant_id) ?? [],
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
