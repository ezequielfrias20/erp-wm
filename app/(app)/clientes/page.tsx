import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { canView, canEdit } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { ClientesView } from "@/components/clientes/clientes-view";

export const metadata = { title: "Clientes · World Medics ERP" };

export default async function ClientesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Clientes")) redirect("/dashboard");

  const supabase = await createClient();
  const [customersRes, eventsRes, favsRes, branchesRes, bcv] = await Promise.all([
    supabase
      .from("v_customer_stats")
      .select("*")
      .order("total_spent", { ascending: false }),
    supabase
      .from("customer_events")
      .select("*")
      .order("occurred_at", { ascending: false }),
    supabase.from("v_customer_favorites").select("*"),
    supabase.from("branches").select("id, city").eq("is_active", true).order("city"),
    fetchBcvRate().catch(() => ({
      rate: BCV_FALLBACK,
      updatedAt: "",
      source: "BCV",
    })),
  ]);

  return (
    <ClientesView
      customers={customersRes.data ?? []}
      events={eventsRes.data ?? []}
      favorites={favsRes.data ?? []}
      branches={branchesRes.data ?? []}
      rate={bcv.rate}
      canEdit={canEdit(session.permissions, "Clientes")}
    />
  );
}
