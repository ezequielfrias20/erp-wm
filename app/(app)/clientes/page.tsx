import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId } from "@/lib/branch";
import { canView, canEdit } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { ClientesView } from "@/components/clientes/clientes-view";

export const metadata = { title: "Clientes · World Medics ERP" };

export default async function ClientesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Clientes")) redirect("/dashboard");

  const supabase = await createClient();
  const branchId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );
  let customersQ = supabase
    .from("v_customer_stats")
    .select("*")
    .order("total_spent", { ascending: false });
  if (branchId) customersQ = customersQ.eq("branch_id", branchId);

  // Los eventos y favoritos se filtraban con `.in()` sobre los ids de los clientes
  // ya cargados, lo que forzaba un segundo viaje en serie (0.63 s medidos). Ninguna
  // de las dos fuentes tiene branch_id, así que se piden en paralelo y se recortan
  // en memoria contra los clientes de la sucursal activa.
  const eventsQ = supabase
    .from("customer_events")
    .select("*")
    .order("occurred_at", { ascending: false });
  const favsQ = supabase.from("v_customer_favorites").select("*");

  const [customersRes, branchesRes, bcv, eventsRes, favsRes] = await Promise.all([
    customersQ,
    branchId
      ? supabase.from("branches").select("id, city").eq("id", branchId).order("city")
      : supabase.from("branches").select("id, city").eq("is_active", true).order("city"),
    fetchBcvRate().catch(() => ({
      rate: BCV_FALLBACK,
      updatedAt: "",
      source: "BCV",
    })),
    eventsQ,
    favsQ,
  ]);

  const customerIds = new Set((customersRes.data ?? []).map((c) => c.id));
  const events = (eventsRes.data ?? []).filter((e) => customerIds.has(e.customer_id));
  const favorites = (favsRes.data ?? []).filter((f) => customerIds.has(f.customer_id));

  return (
    <ClientesView
      customers={customersRes.data ?? []}
      events={events}
      favorites={favorites}
      branches={branchesRes.data ?? []}
      rate={bcv.rate}
      canEdit={canEdit(session.permissions, "Clientes")}
    />
  );
}
