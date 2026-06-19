import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId } from "@/lib/branch";
import { canView, canEdit } from "@/lib/permissions";
import { InventarioView } from "@/components/inventario/inventario-view";

export const metadata = { title: "Inventario · World Medics ERP" };

export default async function InventarioPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Inventario")) redirect("/dashboard");

  const supabase = await createClient();
  const branchId = await getActiveBranchId();

  let query = supabase.from("v_inventory").select("*").order("product_name");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data: rows } = await query;

  const list = rows ?? [];
  const categories = [
    ...new Set(list.map((r) => r.category).filter(Boolean)),
  ] as string[];
  const brands = [
    ...new Set(list.map((r) => r.brand).filter(Boolean)),
  ] as string[];

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
      rows={list}
      categories={categories.sort()}
      brands={brands.sort()}
      branchLabel={branchLabel}
      canEdit={canEdit(session.permissions, "Inventario")}
    />
  );
}
