import "server-only";
import { createClient } from "@/lib/supabase/server";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLORS = ["#0EA5E9", "#6366F1", "#10B981", "#F59E0B", "#F43F5E", "#64748B"];

export type ReportData = Awaited<ReturnType<typeof getReports>>;

export async function getReports(branchId: string | null) {
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1).toISOString();

  const salesQ = supabase
    .from("sales")
    .select("id, total, status, payment_method, created_at, branch_id")
    .gte("created_at", yearStart)
    .eq("status", "Pagada");
  const linesQ = supabase
    .from("v_sale_lines")
    .select("created_at, quantity, line_total, cost, category, status, branch_id")
    .eq("status", "Pagada")
    .gte("created_at", yearStart);

  const [salesRes, linesRes] = await Promise.all([
    branchId ? salesQ.eq("branch_id", branchId) : salesQ,
    branchId ? linesQ.eq("branch_id", branchId) : linesQ,
  ]);
  const sales = salesRes.data ?? [];
  const lines = linesRes.data ?? [];

  // Monthly breakdown
  const monthly = MONTHS.map((mes, i) => {
    const mSales = sales.filter((s) => new Date(s.created_at).getMonth() === i);
    const mLines = lines.filter((l) => new Date(l.created_at).getMonth() === i);
    const ingresos = mSales.reduce((a, s) => a + Number(s.total), 0);
    const costo = mLines.reduce((a, l) => a + l.cost * l.quantity, 0);
    const ganancia = ingresos - costo;
    return {
      mes,
      ingresos: Math.round(ingresos),
      costo: Math.round(costo),
      ganancia: Math.round(ganancia),
      margen: ingresos > 0 ? Math.round((ganancia / ingresos) * 100) : 0,
      tx: mSales.length,
    };
  }).filter((m) => m.tx > 0 || m.ingresos > 0);

  const totalIngresos = monthly.reduce((a, m) => a + m.ingresos, 0);
  const totalCosto = monthly.reduce((a, m) => a + m.costo, 0);
  const totalGanancia = totalIngresos - totalCosto;
  const totalTx = monthly.reduce((a, m) => a + m.tx, 0);

  const kpis = {
    ingresos: totalIngresos,
    ganancia: totalGanancia,
    margen: totalIngresos > 0 ? (totalGanancia / totalIngresos) * 100 : 0,
    transacciones: totalTx,
    ticket: totalTx > 0 ? totalIngresos / totalTx : 0,
  };

  // Trend (12 months ingresos)
  const trend = MONTHS.map((label, i) => ({
    label,
    value: sales
      .filter((s) => new Date(s.created_at).getMonth() === i)
      .reduce((a, s) => a + Number(s.total), 0),
  }));

  // Breakdown by category
  const catMap = new Map<string, number>();
  for (const l of lines)
    if (l.category) catMap.set(l.category, (catMap.get(l.category) ?? 0) + l.line_total);
  const byCategory = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value: Math.round(value), color: COLORS[i % COLORS.length] }));

  // Breakdown by payment
  const payMap = new Map<string, number>();
  for (const s of sales)
    payMap.set(s.payment_method ?? "Otro", (payMap.get(s.payment_method ?? "Otro") ?? 0) + Number(s.total));
  const byPayment = [...payMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value: Math.round(value), color: COLORS[i % COLORS.length] }));

  return { kpis, monthly, trend, byCategory, byPayment };
}
