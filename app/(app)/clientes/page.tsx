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
  const branchId = await getActiveBranchId(session.profile.branch_id);
  let customersQ = supabase
    .from("v_customer_stats")
    .select("*")
    .order("total_spent", { ascending: false });
  if (branchId) customersQ = customersQ.eq("branch_id", branchId);

  const [customersRes, branchesRes, bcv] = await Promise.all([
    customersQ,
    branchId
      ? supabase.from("branches").select("id, city").eq("id", branchId).order("city")
      : supabase.from("branches").select("id, city").eq("is_active", true).order("city"),
    fetchBcvRate().catch(() => ({
      rate: BCV_FALLBACK,
      updatedAt: "",
      source: "BCV",
    })),
  ]);
  const customerIds = (customersRes.data ?? []).map((c) => c.id);
  const [eventsRes, favsRes] =
    customerIds.length > 0
      ? await Promise.all([
          supabase
            .from("customer_events")
            .select("*")
            .in("customer_id", customerIds)
            .order("occurred_at", { ascending: false }),
          supabase.from("v_customer_favorites").select("*").in("customer_id", customerIds),
        ])
      : [{ data: [] }, { data: [] }];

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
