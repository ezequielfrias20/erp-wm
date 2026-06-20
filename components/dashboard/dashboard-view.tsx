"use client";

import Link from "next/link";
import {
  DollarSign,
  Calendar,
  TrendingUp,
  Receipt,
  Package,
  UserPlus,
  Wallet,
  Percent,
  Plus,
  Download,
  AlertTriangle,
  XCircle,
  Truck,
  Clock,
} from "lucide-react";
import { SalesAreaChart, Donut } from "@/components/dashboard/charts";
import { fmtUSD, fmtUSDShort, fmtVES, fmtNum, fmtRelative } from "@/lib/format";
import type { DashboardData } from "@/lib/queries/dashboard";

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Pagada: { bg: "var(--success-soft)", color: "var(--success)" },
  Pendiente: { bg: "var(--warning-soft)", color: "var(--warning)" },
  Reembolso: { bg: "var(--surface-2)", color: "var(--text-2)" },
  Anulada: { bg: "var(--danger-soft)", color: "var(--danger)" },
};
const ORDER_STYLE: Record<string, { bg: string; color: string }> = {
  "En tránsito": { bg: "var(--brand-soft)", color: "var(--brand)" },
  Confirmado: { bg: "var(--success-soft)", color: "var(--success)" },
  Pendiente: { bg: "var(--warning-soft)", color: "var(--warning)" },
  Recibido: { bg: "var(--surface-2)", color: "var(--text-2)" },
};

export function DashboardView({
  data,
  name,
  rate,
  canSell,
}: {
  data: DashboardData;
  name: string;
  rate: number;
  canSell: boolean;
}) {
  const { kpis } = data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const today = new Date().toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const kpiCards = [
    { icon: DollarSign, label: "Ventas del día", value: fmtUSD(kpis.day), sub: fmtVES(kpis.day * rate) },
    { icon: Calendar, label: "Ventas del mes", value: fmtUSD(kpis.month), sub: fmtVES(kpis.month * rate) },
    { icon: TrendingUp, label: "Ventas del año", value: fmtUSDShort(kpis.year), sub: fmtVES(kpis.year * rate) },
    { icon: Receipt, label: "Ticket promedio", value: fmtUSD(kpis.ticket), sub: fmtVES(kpis.ticket * rate) },
    { icon: Package, label: "Productos vendidos", value: `${fmtNum(kpis.productsSold)} uds`, sub: "este mes" },
    { icon: UserPlus, label: "Clientes nuevos", value: fmtNum(kpis.newCustomers), sub: "este mes" },
    { icon: Wallet, label: "Ganancia bruta", value: fmtUSD(kpis.grossProfit), sub: fmtVES(kpis.grossProfit * rate) },
    { icon: Percent, label: "Margen promedio", value: `${kpis.margin.toFixed(1)}%`, sub: "sobre costo" },
  ];

  const payTotal = data.payments.reduce((a, p) => a + p.value, 0);
  const catTotal = data.categories.reduce((a, c) => a + c.value, 0);
  const yearTotal = data.monthly.reduce((a, m) => a + m.value, 0);
  const branchMax = Math.max(1, ...data.branches.map((b) => b.value));
  const prodMax = Math.max(1, ...data.topProducts.map((p) => p.units));

  return (
    <div className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12">
      <div className="fadeup mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            {greeting}, {name}
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            Resumen de operaciones · {today}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button className="iconbtn flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-card px-[13px] text-[13px] font-medium text-foreground">
            <Download className="size-4 text-text-3" /> Exportar
          </button>
          {canSell && (
            <Link
              href="/ventas"
              className="hoverlift flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-[15px] text-[13px] font-semibold text-white"
            >
              <Plus className="size-4" /> Nueva venta
            </Link>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="fadeup mb-[18px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <div
            key={k.label}
            className="hoverlift flex flex-col gap-3 rounded-2xl border border-border bg-card p-[17px] shadow-card-sm"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 flex-none items-center justify-center rounded-[9px] bg-brand-soft text-brand">
                <k.icon className="size-[18px]" />
              </span>
              <span className="truncate text-[12.5px] font-medium text-text-2">
                {k.label}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[22px] font-bold tracking-tight text-foreground">
                {k.value}
              </span>
              <span className="text-[11.5px] text-text-3">{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Monthly + payments */}
      <div className="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-12">
        <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm lg:col-span-8">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <div className="text-[15px] font-bold tracking-tight text-foreground">
                Ventas por mes
              </div>
              <div className="text-[12.5px] text-text-3">
                Ingresos {new Date().getFullYear()} · USD
              </div>
            </div>
            <div className="text-right">
              <div className="text-[20px] font-bold tracking-tight text-foreground">
                {fmtUSDShort(yearTotal)}
              </div>
              <div className="text-[11.5px] text-text-3">acumulado anual</div>
            </div>
          </div>
          <SalesAreaChart data={data.monthly} />
        </div>

        <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm lg:col-span-4">
          <div className="text-[15px] font-bold tracking-tight text-foreground">
            Métodos de pago
          </div>
          <div className="text-[12.5px] text-text-3">Distribución del mes</div>
          <div className="mt-4 flex items-center gap-4">
            <Donut
              data={data.payments}
              centerValue={String(data.payments.length)}
              centerLabel="métodos"
            />
            <div className="flex flex-1 flex-col gap-2">
              {data.payments.map((s) => (
                <Legend
                  key={s.name}
                  color={s.color}
                  name={s.name}
                  pct={payTotal ? Math.round((s.value / payTotal) * 100) : 0}
                />
              ))}
              {data.payments.length === 0 && (
                <span className="text-[12px] text-text-3">Sin ventas este mes.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Branch / top products / categories */}
      <div className="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-3">
        <Card title="Ventas por sucursal" subtitle="Este mes · USD">
          <div className="flex flex-col gap-3.5">
            {data.branches.map((b) => (
              <div key={b.name}>
                <div className="mb-1.5 flex justify-between text-[12.5px]">
                  <span className="font-medium text-text-2">{b.name}</span>
                  <span className="font-semibold text-foreground">{fmtUSDShort(b.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(b.value / branchMax) * 100}%`,
                      background: "linear-gradient(90deg,var(--brand-2),var(--brand))",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Top productos" subtitle="Unidades vendidas">
          <div className="flex flex-col gap-3">
            {data.topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="flex size-6 flex-none items-center justify-center rounded-[7px] bg-surface-2 text-[11.5px] font-bold text-text-2">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-foreground">
                    {p.name}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(p.units / prodMax) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="flex-none text-[12.5px] font-semibold text-foreground">
                  {p.units}
                </span>
              </div>
            ))}
            {data.topProducts.length === 0 && (
              <span className="text-[12px] text-text-3">Sin ventas registradas.</span>
            )}
          </div>
        </Card>

        <Card title="Top categorías" subtitle="Participación del mes">
          <div className="flex items-center gap-4">
            <Donut
              data={data.categories}
              centerValue={String(data.categories.length)}
              centerLabel="categorías"
              size={120}
            />
            <div className="flex flex-1 flex-col gap-2">
              {data.categories.map((s) => (
                <Legend
                  key={s.name}
                  color={s.color}
                  name={s.name}
                  pct={catTotal ? Math.round((s.value / catTotal) * 100) : 0}
                />
              ))}
              {data.categories.length === 0 && (
                <span className="text-[12px] text-text-3">Sin datos.</span>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Recent sales + low stock */}
      <div className="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-12">
        <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm lg:col-span-8">
          <div className="flex items-center justify-between px-5 pt-[18px] pb-3.5">
            <div>
              <div className="text-[15px] font-bold tracking-tight text-foreground">
                Últimas ventas
              </div>
              <div className="text-[12.5px] text-text-3">Transacciones recientes</div>
            </div>
            <Link href="/ventas" className="lk text-[12.5px] font-medium text-brand">
              Ver todas
            </Link>
          </div>
          <div className="grid grid-cols-[1.2fr_1.4fr_1fr_1fr_0.9fr] border-y border-border px-5 py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
            <span>Factura</span>
            <span>Cliente</span>
            <span>Método</span>
            <span className="text-right">Total</span>
            <span className="text-right">Estado</span>
          </div>
          {data.recentSales.map((r) => {
            const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.Pagada;
            return (
              <div
                key={r.inv}
                className="tr-row grid grid-cols-[1.2fr_1.4fr_1fr_1fr_0.9fr] items-center border-b border-border px-5 py-3"
              >
                <span className="text-[12.5px] font-semibold text-foreground">{r.inv}</span>
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] text-foreground">{r.customer}</div>
                  <div className="text-[11px] text-text-3">{r.branch}</div>
                </div>
                <span className="text-[12px] text-text-2">{r.method}</span>
                <div className="text-right">
                  <div className="text-[12.5px] font-semibold text-foreground">{fmtUSD(r.total)}</div>
                  <div className="text-[11px] text-text-3">{fmtVES(r.ves)}</div>
                </div>
                <div className="text-right">
                  <span
                    className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: st.bg, color: st.color }}
                  >
                    {r.status}
                  </span>
                </div>
              </div>
            );
          })}
          {data.recentSales.length === 0 && (
            <div className="px-5 py-8 text-center text-[12.5px] text-text-3">Sin ventas.</div>
          )}
        </div>

        <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm lg:col-span-4">
          <div className="flex items-center gap-2.5 px-5 pt-[18px] pb-3.5">
            <span className="flex size-8 items-center justify-center rounded-[9px] bg-warning-soft text-warning">
              <AlertTriangle className="size-4" />
            </span>
            <div className="flex-1">
              <div className="text-[14.5px] font-bold text-foreground">Stock bajo</div>
              <div className="text-[11.5px] text-text-3">Por debajo del mínimo</div>
            </div>
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning">
              {data.lowStock.length}
            </span>
          </div>
          <div className="border-t border-border">
            {data.lowStock.map((s, i) => (
              <div
                key={i}
                className="tr-row flex items-center gap-3 border-b border-border px-5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-foreground">{s.name}</div>
                  <div className="text-[11px] text-text-3">{s.branch}</div>
                </div>
                <div className="flex-none text-right">
                  <span
                    className="text-[13px] font-bold"
                    style={{ color: s.cur / Math.max(s.min, 1) <= 0.33 ? "var(--danger)" : "var(--warning)" }}
                  >
                    {s.cur}
                  </span>
                  <span className="text-[11.5px] text-text-3"> / {s.min}</span>
                </div>
              </div>
            ))}
            {data.lowStock.length === 0 && (
              <div className="px-5 py-6 text-center text-[12.5px] text-text-3">Todo en orden.</div>
            )}
          </div>
        </div>
      </div>

      {/* Orders / out / activity */}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3">
        <ListCard icon={Truck} tone="brand" title="Próximos pedidos" subtitle="Órdenes de compra">
          {data.orders.map((o) => {
            const st = ORDER_STYLE[o.status] ?? ORDER_STYLE.Pendiente;
            return (
              <div key={o.code} className="tr-row flex items-center gap-3 border-b border-border px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-foreground">{o.code}</div>
                  <div className="truncate text-[11.5px] text-text-3">
                    {o.supplier} · {o.date ?? "—"}
                  </div>
                </div>
                <span
                  className="flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{ background: st.bg, color: st.color }}
                >
                  {o.status}
                </span>
              </div>
            );
          })}
          {data.orders.length === 0 && <Empty />}
        </ListCard>

        <ListCard icon={XCircle} tone="danger" title="Productos agotados" subtitle="Requieren reabastecimiento">
          {data.outStock.map((o, i) => (
            <div key={i} className="tr-row flex items-center gap-3 border-b border-border px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-foreground">{o.name}</div>
                <div className="text-[11.5px] text-text-3">{o.branch}</div>
              </div>
              <Link href="/inventario" className="lk flex-none text-[11.5px] font-semibold text-brand">
                Reabastecer
              </Link>
            </div>
          ))}
          {data.outStock.length === 0 && <Empty />}
        </ListCard>

        <ListCard icon={Clock} tone="muted" title="Actividad reciente" subtitle="Eventos del sistema">
          <div className="px-5 py-4">
            {data.activity.map((a, i) => (
              <div key={i} className="flex gap-3 pb-3.5">
                <div className="flex flex-none flex-col items-center">
                  <span className="mt-1 size-2.5 rounded-full bg-brand" />
                  {i < data.activity.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] leading-snug text-text-2">
                    <strong className="font-semibold text-foreground">{a.who}</strong> {a.action}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-3">{fmtRelative(a.at)}</div>
                </div>
              </div>
            ))}
            {data.activity.length === 0 && <Empty />}
          </div>
        </ListCard>
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
      <div className="text-[15px] font-bold tracking-tight text-foreground">{title}</div>
      <div className="mb-4 text-[12.5px] text-text-3">{subtitle}</div>
      {children}
    </div>
  );
}

function ListCard({
  icon: Icon,
  tone,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "danger" | "muted";
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const map = {
    brand: { bg: "var(--brand-soft)", color: "var(--brand)" },
    danger: { bg: "var(--danger-soft)", color: "var(--danger)" },
    muted: { bg: "var(--surface-2)", color: "var(--text-2)" },
  }[tone];
  return (
    <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
      <div className="flex items-center gap-2.5 border-b border-border px-5 pt-[18px] pb-3.5">
        <span
          className="flex size-8 items-center justify-center rounded-[9px]"
          style={{ background: map.bg, color: map.color }}
        >
          <Icon className="size-4" />
        </span>
        <div>
          <div className="text-[14.5px] font-bold text-foreground">{title}</div>
          <div className="text-[11.5px] text-text-3">{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Legend({ color, name, pct }: { color: string; name: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2.5 flex-none rounded-[3px]" style={{ background: color }} />
      <span className="flex-1 truncate text-[12px] text-text-2">{name}</span>
      <span className="text-[12px] font-semibold text-foreground">{pct}%</span>
    </div>
  );
}

function Empty() {
  return <div className="px-5 py-6 text-center text-[12.5px] text-text-3">Sin datos.</div>;
}
