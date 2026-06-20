import { redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { getDashboard } from "@/lib/queries/dashboard";
import { getActiveBranchId } from "@/lib/branch";
import { canEdit } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata = { title: "Dashboard · World Medics ERP" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const branchId = await getActiveBranchId();
  const [data, bcv] = await Promise.all([
    getDashboard(branchId),
    fetchBcvRate().catch(() => ({
      rate: BCV_FALLBACK,
      updatedAt: "",
      source: "BCV",
    })),
  ]);

  const firstName = session.profile.full_name.split(" ")[0];

  return (
    <DashboardView
      data={data}
      name={firstName}
      rate={bcv.rate}
      canSell={canEdit(session.permissions, "Ventas")}
    />
  );
}
