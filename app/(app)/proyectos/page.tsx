import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { canView, canEdit } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { ProyectosView } from "@/components/proyectos/proyectos-view";

export const metadata = { title: "Proyectos · World Medics ERP" };

export default async function ProyectosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Proyectos")) redirect("/dashboard");

  const supabase = await createClient();
  const [projectsRes, registrationsRes, bcv] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .order("event_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("project_registrations")
      .select("*")
      .order("created_at", { ascending: false }),
    fetchBcvRate().catch(() => ({
      rate: BCV_FALLBACK,
      updatedAt: "",
      source: "BCV",
    })),
  ]);

  return (
    <ProyectosView
      projects={projectsRes.data ?? []}
      registrations={registrationsRes.data ?? []}
      rate={bcv.rate}
      canEdit={canEdit(session.permissions, "Proyectos")}
    />
  );
}
