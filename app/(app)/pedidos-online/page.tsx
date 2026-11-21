import { redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId } from "@/lib/branch";
import { canView } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { listOnlineOrders } from "@/lib/queries/online-orders";
import type { OnlineOrderStatus } from "@/lib/online-orders/types";
import { OrdersList } from "@/components/pedidos-online/orders-list";

export const metadata = { title: "Pedidos online" };

type StatusFilter = OnlineOrderStatus | "activas" | "todas";
const FILTERS: StatusFilter[] = [
  "activas", "solicitada", "aceptada", "completada", "rechazada", "cancelada", "vencida", "todas",
];

export default async function OnlineOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Ventas")) redirect("/dashboard");

  const params = await searchParams;
  const status: StatusFilter = FILTERS.includes(params.estado as StatusFilter)
    ? params.estado as StatusFilter : "activas";
  const q = typeof params.q === "string" ? params.q : "";
  const branchId = await getActiveBranchId(session.profile.branch_id, session.profile.role);
  const [orders, bcv] = await Promise.all([
    listOnlineOrders({ branchId, status, q }),
    fetchBcvRate().catch(() => ({ rate: BCV_FALLBACK })),
  ]);
  // The server snapshot is serialized for the client, so hydration uses the same instant.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return <OrdersList orders={orders} status={status} q={q} rate={bcv.rate} now={now} />;
}
