import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { canView, canEdit } from "@/lib/permissions";
import { MODULES } from "@/lib/database.types";
import { UsuariosView } from "@/components/usuarios/usuarios-view";

export const metadata = { title: "Usuarios y permisos · World Medics ERP" };

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Usuarios")) redirect("/dashboard");

  const supabase = await createClient();
  const [profilesRes, branchesRes, rolesRes, permsRes] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("branches").select("id, city").order("city"),
    supabase.from("roles").select("name").order("sort_order"),
    supabase.from("role_permissions").select("*"),
  ]);

  const branches = branchesRes.data ?? [];
  const branchMap = new Map(branches.map((b) => [b.id, b.city]));
  const users = (profilesRes.data ?? []).map((p) => ({
    ...p,
    branch_city: p.branch_id ? (branchMap.get(p.branch_id) ?? null) : null,
  }));

  return (
    <UsuariosView
      users={users}
      roles={(rolesRes.data ?? []).map((r) => r.name)}
      modules={[...MODULES]}
      permissions={permsRes.data ?? []}
      branches={branches}
      canEdit={canEdit(session.permissions, "Usuarios")}
    />
  );
}
