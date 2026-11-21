import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { canEdit } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { heartbeatStatus } from "@/lib/keep-alive";
import { ConfiguracionView } from "@/components/configuracion/configuracion-view";

export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const [settingsRes, pmRes, auditRes, bcv, heartbeatRes] =
    await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("payment_methods").select("*").order("sort_order"),
      supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12),
      fetchBcvRate().catch(() => ({
        rate: BCV_FALLBACK,
        updatedAt: "",
        source: "BCV",
      })),
      supabase.from("heartbeat").select("last_beat_at").eq("id", 1).maybeSingle(),
    ]);

  // Sin keep_alive.sql la consulta falla: entonces no se muestra la línea del latido.
  // El estado se calcula aquí porque lib/keep-alive usa node:crypto (no va al navegador).
  const lastBeatAt = heartbeatRes.data?.last_beat_at ?? null;
  const heartbeat = heartbeatRes.error
    ? null
    : { lastBeatAt, status: heartbeatStatus(lastBeatAt) };

  return (
    <ConfiguracionView
      profile={session.profile}
      settings={settingsRes.data!}
      paymentMethods={pmRes.data ?? []}
      canEditCatalog={canEdit(session.permissions, "Inventario")}
      audit={auditRes.data ?? []}
      rate={bcv.rate}
      canEdit={canEdit(session.permissions, "Configuración")}
      heartbeat={heartbeat}
    />
  );
}
