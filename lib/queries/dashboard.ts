import "server-only";
import { createClient } from "@/lib/supabase/server";

const CHART_COLORS = ["#0EA5E9", "#6366F1", "#10B981", "#F59E0B", "#F43F5E", "#64748B"];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export async function getDashboard(branchId: string | null) {
  const supabase = await createClient();
  const now = new Date();
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1).toISOString();
  const monthStart = new Date(year, now.getMonth(), 1).toISOString();
  const dayStart = new Date(year, now.getMonth(), now.getDate()).toISOString();

  const salesQ = supabase
    .from("sales")
    .select("id, total, tax, payment_method, status, created_at, customer_id, branch_id")
    .gte("created_at", yearStart);
  const linesQ = supabase
    .from("v_sale_lines")
    .select("*")
    .gte("created_at", yearStart);
  const invQ = supabase.from("v_inventory").select("*");

  const [salesRes, linesRes, invRes, branchStatsRes, ordersRes, suppliersRes, activityRes, custRes] =
    await Promise.all([
      branchId ? salesQ.eq("branch_id", branchId) : salesQ,
      branchId ? linesQ.eq("branch_id", branchId) : linesQ,
      branchId ? invQ.eq("branch_id", branchId) : invQ,
      supabase.from("v_branch_stats").select("city, month_sales").order("month_sales", { ascending: false }),
      supabase
        .from("purchase_orders")
        .select("code, status, expected_date, supplier_id")
        .order("expected_date")
        .limit(3),
      supabase.from("suppliers").select("id, name"),
      supabase.from("audit_log").select("who, action, module, created_at").order("created_at", { ascending: false }).limit(6),
      supabase.from("customers").select("id, created_at, branch_id").gte("created_at", monthStart),
    ]);

  const sales = salesRes.data ?? [];
  const lines = linesRes.data ?? [];
  const inv = invRes.data ?? [];
  const paid = sales.filter((s) => s.status === "Pagada");
  const monthPaid = paid.filter((s) => s.created_at >= monthStart);
  const sum = (arr: { total: number }[]) => arr.reduce((a, s) => a + Number(s.total), 0);

  // KPIs
  const monthSales = sum(monthPaid);
  const monthLines = lines.filter((l) => l.status === "Pagada" && l.created_at >= monthStart);
  const productsSold = monthLines.reduce((a, l) => a + l.quantity, 0);
  const grossProfit = monthLines.reduce((a, l) => a + (l.line_total - l.cost * l.quantity), 0);
  const newCustomers = (custRes.data ?? []).filter(
    (c) => !branchId || c.branch_id === branchId,
  ).length;

  const kpis = {
    day: sum(paid.filter((s) => s.created_at >= dayStart)),
    month: monthSales,
    year: sum(paid),
    ticket: monthPaid.length ? monthSales / monthPaid.length : 0,
    productsSold,
    newCustomers,
    grossProfit,
    margin: monthSales > 0 ? (grossProfit / monthSales) * 100 : 0,
  };

  // Monthly series (current year, paid)
  const monthly = MONTHS.map((label, i) => {
    const v = paid
      .filter((s) => new Date(s.created_at).getMonth() === i)
      .reduce((a, s) => a + Number(s.total), 0);
    return { label, value: Math.round(v) };
  });

  // Payment breakdown (month, paid)
  const payMap = new Map<string, number>();
  for (const s of monthPaid)
    payMap.set(s.payment_method ?? "Otro", (payMap.get(s.payment_method ?? "Otro") ?? 0) + Number(s.total));
  const payments = [...payMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value: Math.round(value), color: CHART_COLORS[i % CHART_COLORS.length] }));

  // Branch sales bars
  const branches = (branchStatsRes.data ?? []).map((b) => ({
    name: b.city,
    value: Math.round(Number(b.month_sales)),
  }));

  // Top products (paid, year)
  const prodMap = new Map<string, number>();
  for (const l of lines.filter((l) => l.status === "Pagada"))
    if (l.product_name) prodMap.set(l.product_name, (prodMap.get(l.product_name) ?? 0) + l.quantity);
  const topProducts = [...prodMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, units]) => ({ name, units }));

  // Categories (paid, month, by revenue)
  const catMap = new Map<string, number>();
  for (const l of monthLines)
    if (l.category) catMap.set(l.category, (catMap.get(l.category) ?? 0) + l.line_total);
  const categories = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value: Math.round(value), color: CHART_COLORS[i % CHART_COLORS.length] }));

  // Recent sales (with customer + branch names)
  const recentRaw = [...sales].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 6);
  const custIds = [...new Set(recentRaw.map((s) => s.customer_id).filter(Boolean))] as string[];
  const brIds = [...new Set(recentRaw.map((s) => s.branch_id))];
  const [custNames, brNames, invoiceNos] = await Promise.all([
    custIds.length
      ? supabase.from("customers").select("id, name").in("id", custIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from("branches").select("id, city").in("id", brIds),
    supabase.from("sales").select("id, invoice_number, total, total_ves").in("id", recentRaw.map((s) => s.id)),
  ]);
  const cMap = new Map((custNames.data ?? []).map((c) => [c.id, c.name]));
  const bMap = new Map((brNames.data ?? []).map((b) => [b.id, b.city]));
  const iMap = new Map((invoiceNos.data ?? []).map((s) => [s.id, s]));
  const recentSales = recentRaw.map((s) => ({
    inv: iMap.get(s.id)?.invoice_number ?? "—",
    customer: s.customer_id ? (cMap.get(s.customer_id) ?? "Cliente general") : "Cliente general",
    branch: bMap.get(s.branch_id) ?? "—",
    method: s.payment_method ?? "—",
    total: Number(iMap.get(s.id)?.total ?? s.total),
    ves: Number(iMap.get(s.id)?.total_ves ?? 0),
    status: s.status,
  }));

  // Low / out stock
  const lowStock = inv
    .filter((r) => r.estado === "Stock bajo")
    .slice(0, 5)
    .map((r) => ({ name: r.product_name, branch: r.branch_city, cur: r.quantity, min: r.min_stock }));
  const outStock = inv
    .filter((r) => r.estado === "Agotado")
    .slice(0, 5)
    .map((r) => ({ name: r.product_name, branch: r.branch_city }));

  // Orders
  const supMap = new Map((suppliersRes.data ?? []).map((s) => [s.id, s.name]));
  const orders = (ordersRes.data ?? []).map((o) => ({
    code: o.code,
    supplier: o.supplier_id ? (supMap.get(o.supplier_id) ?? "—") : "—",
    date: o.expected_date,
    status: o.status,
  }));

  // Activity
  const activity = (activityRes.data ?? []).map((a) => ({
    who: a.who ?? "Sistema",
    action: a.action,
    module: a.module,
    at: a.created_at,
  }));

  return {
    kpis,
    monthly,
    payments,
    branches,
    topProducts,
    categories,
    recentSales,
    lowStock,
    outStock,
    orders,
    activity,
  };
}
