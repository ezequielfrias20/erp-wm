import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CasheaStatus, CasheaChannel } from "@/lib/database.types";

export type CasheaStatusFilter = CasheaStatus | "todas";
export type CasheaChannelFilter = CasheaChannel | "todos";

export type CasheaOrderRow = {
  id: string;
  reference: string;
  status: CasheaStatus;
  channel: CasheaChannel;
  total: number;
  initial_amount: number;
  financed_amount: number;
  commission_pct: number;
  commission_amount: number | null;
  net_amount: number | null;
  settled_at: string | null;
  settled_amount: number | null;
  notes: string | null;
  created_at: string;
  invoice_number: string | null;
  customer: string | null;
};

export type CasheaChannelStat = {
  channel: CasheaChannel;
  ventas: number; // total vendido por el canal (USD)
  porCobrar: number; // financiado pendiente (USD)
  cobrado: number; // depositado por Cashea (USD)
  comision: number; // comisión retenida (USD)
  count: number; // cantidad de órdenes
};

export type CasheaKpis = {
  ventasCashea: number; // total de ventas financiadas con Cashea (USD)
  inicialCobrado: number; // suma de iniciales cobradas en caja (USD)
  porCobrar: number; // financiado pendiente de cobro a Cashea (USD)
  cobrado: number; // depositado por Cashea en órdenes conciliadas (USD)
  comisionTotal: number; // comisión retenida por Cashea en órdenes conciliadas (USD)
  pendientes: number; // cantidad de órdenes pendientes
};

export type CasheaData = Awaited<ReturnType<typeof getCasheaOrders>>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Órdenes de financiamiento Cashea + KPIs agregados. Todas las cifras se leen
 * desde wm.cashea_orders (el libro de cuentas por cobrar), nunca de sale_payments,
 * para no confundir lo financiado con efectivo en caja.
 */
export async function getCasheaOrders(
  branchId: string | null,
  opts: {
    status?: CasheaStatusFilter;
    channel?: CasheaChannelFilter;
    from?: string;
    to?: string;
  } = {},
) {
  const supabase = await createClient();
  let q = supabase
    .from("cashea_orders")
    .select(
      "id, reference, status, channel, total, initial_amount, financed_amount, commission_pct, commission_amount, net_amount, settled_at, settled_amount, notes, created_at, sales(invoice_number, customers(name))",
    )
    .order("created_at", { ascending: false });

  if (branchId) q = q.eq("branch_id", branchId);
  if (opts.status && opts.status !== "todas") q = q.eq("status", opts.status);
  if (opts.channel && opts.channel !== "todos") q = q.eq("channel", opts.channel);
  if (opts.from) q = q.gte("created_at", new Date(opts.from + "T00:00:00").toISOString());
  if (opts.to) q = q.lte("created_at", new Date(opts.to + "T23:59:59.999").toISOString());

  const { data } = await q;

  const orders: CasheaOrderRow[] = (data ?? []).map((o) => {
    const sale = o.sales as {
      invoice_number?: string;
      customers?: { name?: string } | null;
    } | null;
    return {
      id: o.id,
      reference: o.reference,
      status: o.status as CasheaStatus,
      channel: (o.channel ?? "tienda") as CasheaChannel,
      total: Number(o.total),
      initial_amount: Number(o.initial_amount),
      financed_amount: Number(o.financed_amount),
      commission_pct: Number(o.commission_pct),
      commission_amount: o.commission_amount != null ? Number(o.commission_amount) : null,
      net_amount: o.net_amount != null ? Number(o.net_amount) : null,
      settled_at: o.settled_at,
      settled_amount: o.settled_amount != null ? Number(o.settled_amount) : null,
      notes: o.notes,
      created_at: o.created_at,
      invoice_number: sale?.invoice_number ?? null,
      customer: sale?.customers?.name ?? null,
    };
  });

  const kpis: CasheaKpis = {
    ventasCashea: 0,
    inicialCobrado: 0,
    porCobrar: 0,
    cobrado: 0,
    comisionTotal: 0,
    pendientes: 0,
  };
  for (const r of orders) {
    if (r.status !== "anulada") {
      kpis.ventasCashea += r.total;
      kpis.inicialCobrado += r.initial_amount;
    }
    if (r.status === "pendiente") {
      kpis.porCobrar += r.financed_amount;
      kpis.pendientes += 1;
    }
    if (r.status === "cobrada") {
      kpis.cobrado += r.settled_amount ?? 0;
      kpis.comisionTotal += r.commission_amount ?? 0;
    }
  }
  kpis.ventasCashea = round2(kpis.ventasCashea);
  kpis.inicialCobrado = round2(kpis.inicialCobrado);
  kpis.porCobrar = round2(kpis.porCobrar);
  kpis.cobrado = round2(kpis.cobrado);
  kpis.comisionTotal = round2(kpis.comisionTotal);

  // Desglose por canal (tienda vs online) — comisiones distintas por canal.
  const mkChannel = (channel: CasheaChannel): CasheaChannelStat => ({
    channel,
    ventas: 0,
    porCobrar: 0,
    cobrado: 0,
    comision: 0,
    count: 0,
  });
  const byChannel: Record<CasheaChannel, CasheaChannelStat> = {
    tienda: mkChannel("tienda"),
    online: mkChannel("online"),
  };
  for (const r of orders) {
    const c = byChannel[r.channel] ?? byChannel.tienda;
    if (r.status !== "anulada") {
      c.ventas += r.total;
      c.count += 1;
    }
    if (r.status === "pendiente") c.porCobrar += r.financed_amount;
    if (r.status === "cobrada") {
      c.cobrado += r.settled_amount ?? 0;
      c.comision += r.commission_amount ?? 0;
    }
  }
  for (const c of Object.values(byChannel)) {
    c.ventas = round2(c.ventas);
    c.porCobrar = round2(c.porCobrar);
    c.cobrado = round2(c.cobrado);
    c.comision = round2(c.comision);
  }

  return { orders, kpis, byChannel };
}
