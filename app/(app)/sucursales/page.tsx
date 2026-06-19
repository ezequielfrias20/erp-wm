import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getBranchStats } from "@/lib/queries/branches";
import { canView, canEdit } from "@/lib/permissions";
import { SucursalesView } from "@/components/sucursales/sucursales-view";

export const metadata = { title: "Sucursales · World Medics ERP" };

export default async function SucursalesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Sucursales")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [branches, managersRes] = await Promise.all([
    getBranchStats(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("status", "Activo")
      .order("full_name"),
  ]);

  return (
    <SucursalesView
      branches={branches}
      managers={managersRes.data ?? []}
      canEdit={canEdit(session.permissions, "Sucursales")}
    />
  );
}
