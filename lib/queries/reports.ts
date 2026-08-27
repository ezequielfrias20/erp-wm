import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  enumerateReportMonths,
  getReportDateParts,
  reportRangeToIso,
} from "@/lib/report-dates";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { rpcOrFallback, selectWithOptionalColumns } from "@/lib/db-capabilities";

const COLORS = ["#0EA5E9", "#6366F1", "#10B981", "#F59E0B", "#F43F5E", "#64748B", "#8B5CF6", "#14B8A6"];
const DEFAULT_SELLER_COMMISSION_PCT = 2;

export type ReportData = Awaited<ReturnType<typeof getReports>>;

export type SaleRow = {
  id: string;
  invoice_number: string;
  created_at: string;
  customer: string | null;
  seller: string | null;
  payment_method: string | null;
  total: number;
  total_ves: number | null;
  commission_pct: number;
  commission: number;
  status: string;
};

export type SellerCommissionRow = {
  seller_id: string;
  seller: string;
  commission_pct: number;
  sales_count: number;
  sales_total: number;
  commission_total: number;
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

type QueryError = { code?: string; message?: string };

type ReportSaleRecord = {
  id: string;
  invoice_number: string;
  total: number;
  total_ves: number | null;
  status: string;
  payment_method: string | null;
  exchange_rate: number | null;
  created_at: string;
  branch_id: string;
  seller_id: string | null;
  seller_commission_pct?: number | null;
  customers: { name?: string } | null;
};

type SellerProfileRecord = {
  id: string;
  full_name: string;
  commission_pct?: number | null;
};

type ReportPaymentRecord = {
  sale_id: string;
  method: string;
  currency: string;
  amount: number;
  amount_usd: number;
};

const IN_FILTER_BATCH_SIZE = 100;

function isMissingColumn(error: unknown, column: string) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as QueryError;
  return candidate.code === "42703" && Boolean(candidate.message?.includes(column));
}

function assertQueryOk(error: unknown, context: string) {
  if (!error) return;
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message)
      : "Error desconocido";
  throw new Error(`${context}: ${message}`);
}

async function fetchReportSales(
  supabase: Awaited<ReturnType<typeof createClient>>,
  branchId: string | null,
  fromIso: string,
  toIso: string,
) {
  const baseSelect =
    "id, invoice_number, total, total_ves, status, payment_method, exchange_rate, created_at, branch_id, seller_id, customers(name)";

  const run = (select: string) =>
    fetchAllRows<ReportSaleRecord>((pageFrom, pageTo) => {
      let query = supabase
        .from("sales")
        .select(select)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .eq("status", "Pagada")
        .order("created_at", { ascending: false })
        .range(pageFrom, pageTo);
      if (branchId) query = query.eq("branch_id", branchId);
      return query as unknown as PromiseLike<{
        data: ReportSaleRecord[] | null;
        error: { message: string } | null;
      }>;
    });

  // `seller_commission_pct` puede no existir todavía en el esquema. Antes eso hacía
  // que la consulta completa de ventas corriera DOS veces en cada carga; ahora la
  // ausencia se recuerda por proceso (ver db-capabilities).
  try {
    return await selectWithOptionalColumns(
      "sales",
      "seller_commission_pct",
      `${baseSelect}, seller_commission_pct`,
      baseSelect,
      run,
    );
  } catch (error) {
    throw new Error(
      `No se pudieron cargar las ventas del reporte: ${error instanceof Error ? error.message : "Error desconocido"}`,
    );
  }
}

async function fetchReportPayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  saleIds: string[],
  branchId: string | null,
  fromIso: string,
  toIso: string,
): Promise<ReportPaymentRecord[]> {
  return rpcOrFallback<ReportPaymentRecord[]>(
    "report_payments",
    async () => {
      const { data, error } = await supabase.rpc("report_payments", {
        p_branch_id: branchId,
        p_from: fromIso,
        p_to: toIso,
      });
      return { data: (data ?? []) as ReportPaymentRecord[], error };
    },
    // Respaldo mientras performance_indexes.sql no esté aplicado. Los lotes van en
    // paralelo: antes eran seriales (5 viajes encadenados = ~1.5 s medidos).
    async () => {
      const batches: string[][] = [];
      for (let index = 0; index < saleIds.length; index += IN_FILTER_BATCH_SIZE) {
        batches.push(saleIds.slice(index, index + IN_FILTER_BATCH_SIZE));
      }

      const results = await Promise.all(
        batches.map(async (ids) => {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const result = await supabase
              .from("sale_payments")
              .select("sale_id, method, currency, amount, amount_usd")
              .in("sale_id", ids);
            if (!result.error) return (result.data ?? []) as ReportPaymentRecord[];
            if (attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 150));
            } else {
              assertQueryOk(result.error, "No se pudieron cargar los pagos del reporte");
            }
          }
          return [] as ReportPaymentRecord[];
        }),
      );

      return results.flat();
    },
  );
}

async function fetchSellerProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sellerIds: string[],
) {
  if (!sellerIds.length) return [] as SellerProfileRecord[];

  // Igual que en las ventas: si `commission_pct` no está, se recuerda por proceso
  // en vez de repetir la consulta en cada carga del reporte.
  const run = async (select: string) => {
    const result = await supabase.from("profiles").select(select).in("id", sellerIds);
    if (result.error) {
      if (isMissingColumn(result.error, "commission_pct")) {
        throw new Error(result.error.message);
      }
      assertQueryOk(result.error, "No se pudieron cargar los vendedores del reporte");
    }
    return (result.data ?? []) as unknown as SellerProfileRecord[];
  };

  return selectWithOptionalColumns(
    "profiles",
    "commission_pct",
    "id, full_name, commission_pct",
    "id, full_name",
    run,
  );
}

export async function getReports(
  branchId: string | null,
  from: string,
  to: string,
  rate: number,
  salesPage = 1,
  salesPageSize = 25,
) {
  const supabase = await createClient();
  const range = reportRangeToIso(from, to);
  const { fromIso, toIso } = range;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // Cashea no depende de nada de lo anterior: iba en serie al final (0.82 s medidos).
  let casheaQ = supabase
    .from("cashea_orders")
    .select(
      "total, initial_amount, financed_amount, commission_amount, settled_amount, status, channel",
    )
    .gte("created_at", fromIso)
    .lte("created_at", toIso);
  if (branchId) casheaQ = casheaQ.eq("branch_id", branchId);

  const [sales, lines, pmRes, casheaRes] = await Promise.all([
    fetchReportSales(supabase, branchId, fromIso, toIso),
    fetchAllRows<{
      created_at: string;
      quantity: number;
      line_total: number;
      cost: number;
      category: string | null;
      status: string;
      branch_id: string;
    }>((pageFrom, pageTo) => {
      let query = supabase
        .from("v_sale_lines")
        .select("created_at, quantity, line_total, cost, category, status, branch_id")
        .eq("status", "Pagada")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .range(pageFrom, pageTo);
      if (branchId) query = query.eq("branch_id", branchId);
      return query;
    }),
    supabase.from("payment_methods").select("name, currency, is_financed"),
    casheaQ,
  ]);
  assertQueryOk(pmRes.error, "No se pudieron cargar los métodos de pago del reporte");

  const sellerIds = [...new Set(sales.map((s) => s.seller_id).filter(Boolean))] as string[];
  const sellerProfiles = await fetchSellerProfiles(supabase, sellerIds);
  const sellersById = new Map((sellerProfiles ?? []).map((s) => [s.id, s]));
  const pmCurrency = new Map(
    (pmRes.data ?? []).map((p) => [p.name, (p.currency ?? "VES") as "USD" | "VES"]),
  );
  const pmFinanced = new Map(
    (pmRes.data ?? []).map((p) => [p.name, !!p.is_financed]),
  );

  // Desglose de pagos por método (desde wm.sale_payments cuando existe).
  const saleIds = sales.map((s) => s.id);
  const payments = saleIds.length
    ? await fetchReportPayments(supabase, saleIds, branchId, fromIso, toIso)
    : [];

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
  const months = enumerateReportMonths(range.from, range.to);
  const monthly = months.map(({ label, y, m }) => {
    const inMonth = (d: string) => {
      const dt = getReportDateParts(d);
      return dt.year === y && dt.month === m;
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
  const salesList: SaleRow[] = sales.map((s) => {
    const seller = s.seller_id ? sellersById.get(s.seller_id) : null;
    const commissionPct = s.seller_id
      ? Number(s.seller_commission_pct ?? seller?.commission_pct ?? DEFAULT_SELLER_COMMISSION_PCT)
      : 0;
    return {
      id: s.id,
      invoice_number: s.invoice_number,
      created_at: s.created_at,
      customer: (s.customers as { name?: string } | null)?.name ?? null,
      seller: seller?.full_name ?? null,
      payment_method: s.payment_method,
      total: Number(s.total),
      total_ves: s.total_ves != null ? Number(s.total_ves) : null,
      commission_pct: commissionPct,
      commission: r2((Number(s.total) * commissionPct) / 100),
      status: s.status,
    };
  });

  const commissionMap = new Map<string, SellerCommissionRow>();
  for (const sale of salesList) {
    const sellerId = sales.find((s) => s.id === sale.id)?.seller_id;
    if (!sellerId) continue;
    const current = commissionMap.get(sellerId) ?? {
      seller_id: sellerId,
      seller: sale.seller ?? "Vendedor no asignado",
      commission_pct: 0,
      sales_count: 0,
      sales_total: 0,
      commission_total: 0,
    };
    current.sales_count += 1;
    current.sales_total = r2(current.sales_total + sale.total);
    current.commission_total = r2(current.commission_total + sale.commission);
    current.commission_pct =
      current.sales_total > 0 ? r2((current.commission_total / current.sales_total) * 100) : 0;
    commissionMap.set(sellerId, current);
  }
  const commissions = [...commissionMap.values()].sort(
    (a, b) => b.commission_total - a.commission_total,
  );

  // Resumen Cashea (cuentas por cobrar) — fuente de verdad: wm.cashea_orders.
  const casheaRows = casheaRes.data;
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

  const salesTotal = salesList.length;
  const salesFrom = (salesPage - 1) * salesPageSize;

  return {
    kpis,
    monthly,
    trend,
    byCategory,
    byPayment,
    commissions,
    commissionRate: DEFAULT_SELLER_COMMISSION_PCT / 100,
    cashea,
    efectivoCobrado,
    sales: salesList.slice(salesFrom, salesFrom + salesPageSize),
    salesPagination: {
      page: salesPage,
      pageSize: salesPageSize,
      total: salesTotal,
    },
    range: { from: range.from, to: range.to },
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

  // Con la venta ya en mano, el resto sólo necesita sus ids: iba en cinco pasos
  // encadenados (~1.4 s de red) para descargar una factura.
  const [itemsRes, paymentsRes, pmRes, customerRes, branchRes, cashierRes] =
    await Promise.all([
      supabase
        .from("sale_items")
        .select("description, quantity, unit_price, line_total")
        .eq("sale_id", id),
      supabase
        .from("sale_payments")
        .select("method, currency, amount, amount_usd, reference")
        .eq("sale_id", id),
      supabase.from("payment_methods").select("name, is_financed"),
      sale.customer_id
        ? supabase
            .from("customers")
            .select("name, document, phone, email")
            .eq("id", sale.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("branches")
        .select("city")
        .eq("id", sale.branch_id)
        .maybeSingle(),
      sale.user_id
        ? supabase
            .from("profiles")
            .select("full_name")
            .eq("id", sale.user_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const financedMethods = new Set(
    (pmRes.data ?? []).filter((m) => m.is_financed).map((m) => m.name),
  );
  const payments = (paymentsRes.data ?? []).map((p) => ({
    ...p,
    is_financed: financedMethods.has(p.method),
  }));
  const customer = customerRes.data ?? null;
  const cashier = cashierRes.data?.full_name ?? null;

  return {
    sale,
    items: itemsRes.data ?? [],
    payments,
    customer,
    branchName: branchRes.data?.city ?? null,
    cashier,
  };
}
