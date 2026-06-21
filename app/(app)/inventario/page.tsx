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

  // Opciones para la plantilla de carga masiva (todos los SKU y sucursales).
  const [{ data: allVariants }, { data: allBranches }] = await Promise.all([
    supabase
      .from("product_variants")
      .select("sku, size, color, products(name)")
      .order("sku"),
    supabase.from("branches").select("city, code").order("city"),
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
      rows={list}
      categories={categories.sort()}
      brands={brands.sort()}
      skuOptions={skuOptions}
      branchOptions={branchOptions}
      branchLabel={branchLabel}
      canEdit={canEdit(session.permissions, "Inventario")}
    />
  );
}
