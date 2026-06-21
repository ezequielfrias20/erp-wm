import "server-only";
import { createClient } from "@/lib/supabase/server";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLORS = ["#0EA5E9", "#6366F1", "#10B981", "#F59E0B", "#F43F5E", "#64748B", "#8B5CF6", "#14B8A6"];

export type ReportData = Awaited<ReturnType<typeof getReports>>;

export type SaleRow = {
  id: string;
  invoice_number: string;
  created_at: string;
  customer: string | null;
  payment_method: string | null;
  total: number;
  total_ves: number | null;
  status: string;
};

export type PaymentBreakdown = {
  name: string;
  currency: "USD" | "VES";
  usd: number; // total normalizado a USD (para comparar/ordenar)
  native: number; // total en la moneda nativa del método
  color: string;
  is_financed: boolean; // true = financiado (Cashea, por cobrar), no es efectivo cobrado
};

export type CasheaChannelTotals = {
  ventas: number;
  porCobrar: number;
  cobrado: number;
  comision: number;
};

export type CasheaSummary = {
  ventasCashea: number; // total de ventas con financiamiento Cashea (USD)
  inicialCobrado: number; // inicial cobrada en caja (USD)
  porCobrar: number; // financiado pendiente de cobro a Cashea (USD)
  cobrado: number; // depositado por Cashea (órdenes conciliadas, USD)
  comisionTotal: number; // comisión retenida por Cashea (USD)
  tienda: CasheaChannelTotals; // desglose canal en sucursal
  online: CasheaChannelTotals; // desglose canal marketplace
};

/** Enumera los meses (year-month) incluidos en el rango [from, to]. */
function enumerateMonths(from: Date, to: Date) {
  const out: { key: string; label: string; y: number; m: number }[] = [];
  const multiYear = from.getFullYear() !== to.getFullYear();
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (d <= end) {
    const y = d.getFullYear();
    const m = d.getMonth();
    out.push({
      key: `${y}-${m}`,
      label: multiYear ? `${MONTHS[m]} '${String(y).slice(2)}` : MONTHS[m],
      y,
      m,
    });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export async function getReports(
  branchId: string | null,
  from: string,
  to: string,
  rate: number,
) {
  const supabase = await createClient();
  const fromIso = new Date(from + "T00:00:00").toISOString();
  const toIso = new Date(to + "T23:59:59.999").toISOString();

  const salesQ = supabase
    .from("sales")
    .select(
      "id, invoice_number, total, total_ves, status, payment_method, exchange_rate, created_at, branch_id, customers(name)",
    )
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .eq("status", "Pagada")
    .order("created_at", { ascending: false });
  const linesQ = supabase
    .from("v_sale_lines")
    .select("created_at, quantity, line_total, cost, category, status, branch_id")
    .eq("status", "Pagada")
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  const [salesRes, linesRes, pmRes] = await Promise.all([
    branchId ? salesQ.eq("branch_id", branchId) : salesQ,
    branchId ? linesQ.eq("branch_id", branchId) : linesQ,
    supabase.from("payment_methods").select("name, currency, is_financed"),
  ]);
  const sales = salesRes.data ?? [];
  const lines = linesRes.data ?? [];
  const pmCurrency = new Map(
    (pmRes.data ?? []).map((p) => [p.name, (p.currency ?? "VES") as "USD" | "VES"]),
  );
  const pmFinanced = new Map(
    (pmRes.data ?? []).map((p) => [p.name, !!p.is_financed]),
  );

  // Desglose de pagos por método (desde wm.sale_payments cuando existe).
  const saleIds = sales.map((s) => s.id);
  const { data: payments } = saleIds.length
    ? await supabase
        .from("sale_payments")
        .select("sale_id, method, currency, amount, amount_usd")
        .in("sale_id", saleIds)
    : { data: [] as { sale_id: string; method: string; currency: string; amount: number; amount_usd: number }[] };

  const payAgg = new Map<string, { currency: "USD" | "VES"; usd: number; native: number }>();
  const salesWithPayments = new Set<string>();
  for (const p of payments ?? []) {
    salesWithPayments.add(p.sale_id);
    const cur = (p.currency ?? "VES") as "USD" | "VES";
    const e = payAgg.get(p.method) ?? { currency: cur, usd: 0, native: 0 };
    e.usd += Number(p.amount_usd);
    e.native += Number(p.amount);
    payAgg.set(p.method, e);
  }
  // Fallback para ventas sin filas de pago (datos previos a la tabla sale_payments).
  for (const s of sales) {
    if (salesWithPayments.has(s.id)) continue;
    const method = s.payment_method ?? "Otro";
    const cur = pmCurrency.get(method) ?? "USD";
    const e = payAgg.get(method) ?? { currency: cur, usd: 0, native: 0 };
    e.usd += Number(s.total);
    e.native += cur === "VES" ? Number(s.total) * (s.exchange_rate ?? rate) : Number(s.total);
    payAgg.set(method, e);
  }
  const byPayment: PaymentBreakdown[] = [...payAgg.entries()]
    .sort((a, b) => b[1].usd - a[1].usd)
    .map(([name, v], i) => ({
      name,
      currency: v.currency,
      usd: Math.round(v.usd * 100) / 100,
      native: Math.round(v.native * 100) / 100,
      color: COLORS[i % COLORS.length],
      is_financed: pmFinanced.get(name) ?? false,
    }));

  // Desglose mensual dentro del rango.
  const months = enumerateMonths(new Date(from), new Date(to));
  const monthly = months.map(({ label, y, m }) => {
    const inMonth = (d: string) => {
      const dt = new Date(d);
      return dt.getFullYear() === y && dt.getMonth() === m;
    };
    const mSales = sales.filter((s) => inMonth(s.created_at));
    const mLines = lines.filter((l) => inMonth(l.created_at));
    const ingresos = mSales.reduce((a, s) => a + Number(s.total), 0);
    const costo = mLines.reduce((a, l) => a + l.cost * l.quantity, 0);
    const ganancia = ingresos - costo;
    return {
      mes: label,
      ingresos: Math.round(ingresos),
      costo: Math.round(costo),
      ganancia: Math.round(ganancia),
      margen: ingresos > 0 ? Math.round((ganancia / ingresos) * 100) : 0,
      tx: mSales.length,
    };
  });

  const totalIngresos = monthly.reduce((a, m) => a + m.ingresos, 0);
  const totalCosto = monthly.reduce((a, m) => a + m.costo, 0);
  const totalGanancia = totalIngresos - totalCosto;
  const totalTx = sales.length;

  const kpis = {
    ingresos: totalIngresos,
    ganancia: totalGanancia,
    margen: totalIngresos > 0 ? (totalGanancia / totalIngresos) * 100 : 0,
    transacciones: totalTx,
    ticket: totalTx > 0 ? totalIngresos / totalTx : 0,
  };

  const trend = monthly.map((m) => ({ label: m.mes, value: m.ingresos }));

  // Desglose por categoría.
  const catMap = new Map<string, number>();
  for (const l of lines)
    if (l.category) catMap.set(l.category, (catMap.get(l.category) ?? 0) + l.line_total);
  const byCategory = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value: Math.round(value), color: COLORS[i % COLORS.length] }));

  // Tabla de ventas del período.
  const salesList: SaleRow[] = sales.map((s) => ({
    id: s.id,
    invoice_number: s.invoice_number,
    created_at: s.created_at,
    customer: (s.customers as { name?: string } | null)?.name ?? null,
    payment_method: s.payment_method,
    total: Number(s.total),
    total_ves: s.total_ves != null ? Number(s.total_ves) : null,
    status: s.status,
  }));

  // Resumen Cashea (cuentas por cobrar) — fuente de verdad: wm.cashea_orders.
  let casheaQ = supabase
    .from("cashea_orders")
    .select(
      "total, initial_amount, financed_amount, commission_amount, settled_amount, status, channel",
    )
    .gte("created_at", fromIso)
    .lte("created_at", toIso);
  if (branchId) casheaQ = casheaQ.eq("branch_id", branchId);
  const { data: casheaRows } = await casheaQ;
  const mkChannelTotals = (): CasheaChannelTotals => ({
    ventas: 0,
    porCobrar: 0,
    cobrado: 0,
    comision: 0,
  });
  const cashea: CasheaSummary = {
    ventasCashea: 0,
    inicialCobrado: 0,
    porCobrar: 0,
    cobrado: 0,
    comisionTotal: 0,
    tienda: mkChannelTotals(),
    online: mkChannelTotals(),
  };
  for (const c of casheaRows ?? []) {
    const ch = c.channel === "online" ? cashea.online : cashea.tienda;
    if (c.status !== "anulada") {
      cashea.ventasCashea += Number(c.total);
      cashea.inicialCobrado += Number(c.initial_amount);
      ch.ventas += Number(c.total);
    }
    if (c.status === "pendiente") {
      cashea.porCobrar += Number(c.financed_amount);
      ch.porCobrar += Number(c.financed_amount);
    }
    if (c.status === "cobrada") {
      cashea.cobrado += Number(c.settled_amount ?? 0);
      cashea.comisionTotal += Number(c.commission_amount ?? 0);
      ch.cobrado += Number(c.settled_amount ?? 0);
      ch.comision += Number(c.commission_amount ?? 0);
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  cashea.ventasCashea = r2(cashea.ventasCashea);
  cashea.inicialCobrado = r2(cashea.inicialCobrado);
  cashea.porCobrar = r2(cashea.porCobrar);
  cashea.cobrado = r2(cashea.cobrado);
  cashea.comisionTotal = r2(cashea.comisionTotal);
  for (const ch of [cashea.tienda, cashea.online]) {
    ch.ventas = r2(ch.ventas);
    ch.porCobrar = r2(ch.porCobrar);
    ch.cobrado = r2(ch.cobrado);
    ch.comision = r2(ch.comision);
  }
  // Vista de caja: ingresos devengados menos lo que aún está por cobrar a Cashea.
  const efectivoCobrado = Math.round((kpis.ingresos - cashea.porCobrar) * 100) / 100;

  return {
    kpis,
    monthly,
    trend,
    byCategory,
    byPayment,
    cashea,
    efectivoCobrado,
    sales: salesList,
    range: { from, to },
    rate,
  };
}

export type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSaleDetail>>>;

export async function getSaleDetail(id: string) {
  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select(
      "id, invoice_number, created_at, status, branch_id, customer_id, user_id, subtotal, discount, discount_pct, tax, total, exchange_rate, total_ves, payment_method",
    )
    .eq("id", id)
    .maybeSingle();
  if (!sale) return null;

  const [itemsRes, paymentsRes, pmRes] = await Promise.all([
    supabase
      .from("sale_items")
      .select("description, quantity, unit_price, line_total")
      .eq("sale_id", id),
    supabase
      .from("sale_payments")
      .select("method, currency, amount, amount_usd, reference")
      .eq("sale_id", id),
    supabase.from("payment_methods").select("name, is_financed"),
  ]);
  const financedMethods = new Set(
    (pmRes.data ?? []).filter((m) => m.is_financed).map((m) => m.name),
  );
  const payments = (paymentsRes.data ?? []).map((p) => ({
    ...p,
    is_financed: financedMethods.has(p.method),
  }));

  let customer: { name: string; document: string | null; phone: string | null; email: string | null } | null = null;
  if (sale.customer_id) {
    const { data } = await supabase
      .from("customers")
      .select("name, document, phone, email")
      .eq("id", sale.customer_id)
      .maybeSingle();
    customer = data ?? null;
  }
  const { data: b } = await supabase
    .from("branches")
    .select("city")
    .eq("id", sale.branch_id)
    .maybeSingle();
  let cashier: string | null = null;
  if (sale.user_id) {
    const { data: p } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", sale.user_id)
      .maybeSingle();
    cashier = p?.full_name ?? null;
  }

  return {
    sale,
    items: itemsRes.data ?? [],
    payments,
    customer,
    branchName: b?.city ?? null,
    cashier,
  };
}
