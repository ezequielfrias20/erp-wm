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
  const [projectsRes, registrationsRes, groupsRes, sessionsRes, ordersRes, checkinsRes, bcv] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .order("event_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("project_registrations")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("project_groups").select("*").order("created_at", { ascending: true }),
    supabase.from("project_sessions").select("*").order("starts_at", { ascending: true }),
    supabase.from("project_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("project_checkins").select("*").order("checked_in_at", { ascending: false }),
    fetchBcvRate().catch(() => ({
      rate: BCV_FALLBACK,
      updatedAt: "",
      source: "BCV",
    })),
  ]);

  const registrations = registrationsRes.data ?? [];
  const signedReceipts = new Map<string, string>();
  await Promise.all(
    registrations
      .map((registration) => registration.receipt_storage_path)
      .filter((path): path is string => Boolean(path))
      .map(async (path) => {
        if (signedReceipts.has(path)) return;
        const { data } = await supabase.storage.from("wm-private").createSignedUrl(path, 3600);
        if (data?.signedUrl) signedReceipts.set(path, data.signedUrl);
      }),
  );

  const registrationViews = registrations.map((registration) => ({
    ...registration,
    receipt_access_url: registration.receipt_storage_path
      ? signedReceipts.get(registration.receipt_storage_path) ?? null
      : registration.receipt_url,
  }));

  return (
    <ProyectosView
      projects={projectsRes.data ?? []}
      registrations={registrationViews}
      groups={groupsRes.data ?? []}
      sessions={sessionsRes.data ?? []}
      orders={ordersRes.data ?? []}
      checkins={checkinsRes.data ?? []}
      rate={bcv.rate}
      canEdit={canEdit(session.permissions, "Proyectos")}
    />
  );
}
