import { redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId } from "@/lib/branch";
import { canView, canEdit } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import {
  getCasheaOrders,
  type CasheaStatusFilter,
  type CasheaChannelFilter,
} from "@/lib/queries/cashea";
import { CasheaView } from "@/components/cashea/cashea-view";

export const metadata = { title: "Cashea · World Medics ERP" };

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const STATUSES: CasheaStatusFilter[] = ["todas", "pendiente", "cobrada", "anulada"];
const CHANNELS: CasheaChannelFilter[] = ["todos", "tienda", "online"];

export default async function CasheaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string; channel?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Reportes")) redirect("/dashboard");

  const sp = await searchParams;
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 90);
  const from = sp.from || ymd(defaultFrom);
  const to = sp.to || ymd(today);
  const status: CasheaStatusFilter = STATUSES.includes(
    sp.status as CasheaStatusFilter,
  )
    ? (sp.status as CasheaStatusFilter)
    : "todas";
  const channel: CasheaChannelFilter = CHANNELS.includes(
    sp.channel as CasheaChannelFilter,
  )
    ? (sp.channel as CasheaChannelFilter)
    : "todos";

  const branchId = await getActiveBranchId();
  const [bcv, data] = await Promise.all([
    fetchBcvRate().catch(() => ({ rate: BCV_FALLBACK, updatedAt: "", source: "BCV" })),
    getCasheaOrders(branchId, { from, to, status, channel }),
  ]);

  return (
    <CasheaView
      data={data}
      rate={bcv.rate}
      range={{ from, to }}
      status={status}
      channel={channel}
      canSettle={canEdit(session.permissions, "Reportes")}
    />
  );
}
