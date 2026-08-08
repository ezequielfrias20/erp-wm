import { redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { getDashboard, getOperationalDashboard } from "@/lib/queries/dashboard";
import { getActiveBranchId } from "@/lib/branch";
import { canEdit } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { OperationalDashboardView } from "@/components/dashboard/operational-dashboard-view";
import type { Role } from "@/lib/database.types";

export const metadata = { title: "Dashboard · World Medics ERP" };

const EXECUTIVE_DASHBOARD_ROLES = new Set<Role>([
  "Super Admin",
  "Administrador",
  "Gerente",
]);

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const branchId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );
  const canUseExecutiveDashboard = EXECUTIVE_DASHBOARD_ROLES.has(
    session.profile.role,
  );
  const bcvPromise = fetchBcvRate().catch(() => ({
    rate: BCV_FALLBACK,
    updatedAt: "",
    source: "BCV",
  }));

  const firstName = session.profile.full_name.split(" ")[0];

  if (!canUseExecutiveDashboard) {
    const [data, bcv] = await Promise.all([
      getOperationalDashboard(branchId),
      bcvPromise,
    ]);

    return (
      <OperationalDashboardView
        data={data}
        name={firstName}
        rate={bcv.rate}
        canSell={canEdit(session.permissions, "Ventas")}
      />
    );
  }

  const [data, bcv] = await Promise.all([getDashboard(branchId), bcvPromise]);

  return (
    <DashboardView
      data={data}
      name={firstName}
      rate={bcv.rate}
      canSell={canEdit(session.permissions, "Ventas")}
    />
  );
}
