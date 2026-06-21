import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { canEdit } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { ConfiguracionView } from "@/components/configuracion/configuracion-view";

export const metadata = { title: "Configuración · World Medics ERP" };

export default async function ConfiguracionPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const [settingsRes, pmRes, catRes, brandRes, sizeRes, colorRes, auditRes, bcv] =
    await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("payment_methods").select("*").order("sort_order"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("brands").select("*").order("name"),
      supabase.from("sizes").select("*").order("sort_order"),
      supabase.from("colors").select("*").order("sort_order"),
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
    ]);

  return (
    <ConfiguracionView
      profile={session.profile}
      settings={settingsRes.data!}
      paymentMethods={pmRes.data ?? []}
      categories={catRes.data ?? []}
      brands={brandRes.data ?? []}
      sizes={sizeRes.data ?? []}
      colors={colorRes.data ?? []}
      audit={auditRes.data ?? []}
      rate={bcv.rate}
      canEdit={canEdit(session.permissions, "Configuración")}
    />
  );
}
