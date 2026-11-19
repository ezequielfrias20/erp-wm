import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { canEdit, canView } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { isUuid } from "@/lib/online-orders/rules";
import { getOnlineBranches, getOnlineOrder, getOnlineSettings } from "@/lib/queries/online-orders";
import { OrderDetail } from "@/components/pedidos-online/order-detail";

export const metadata = { title: "Detalle de pedido online · World Medics ERP" };

export default async function OnlineOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Ventas")) redirect("/dashboard");

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [order, settings, branches, bcv] = await Promise.all([
    getOnlineOrder(id),
    getOnlineSettings(),
    getOnlineBranches(),
    fetchBcvRate().catch(() => ({ rate: BCV_FALLBACK })),
  ]);
  if (!order) notFound();

  return <OrderDetail
    order={order}
    rate={bcv.rate}
    canManage={canEdit(session.permissions, "Ventas")}
    branches={branches}
    firmHoldHours={settings.firmHoldHours}
    templates={settings.templates}
  />;
}
