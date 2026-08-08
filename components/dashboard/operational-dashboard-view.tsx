"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Package,
  Plus,
  Receipt,
  ShoppingCart,
  Truck,
  XCircle,
} from "lucide-react";
import { fmtNum, fmtUSD, fmtVES } from "@/lib/format";
import type { OperationalDashboardData } from "@/lib/queries/dashboard";

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

export function OperationalDashboardView({
  data,
  name,
  rate,
  canSell,
}: {
  data: OperationalDashboardData;
  name: string;
  rate: number;
  canSell: boolean;
}) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const today = new Date().toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const cards = [
    {
      icon: ShoppingCart,
      label: "Ventas del día",
      value: fmtUSD(data.kpis.todaySales),
      sub: fmtVES(data.kpis.todaySales * rate),
      tone: "brand" as const,
    },
    {
      icon: Receipt,
      label: "Transacciones",
      value: fmtNum(data.kpis.todayTransactions),
      sub: "ventas pagadas hoy",
      tone: "muted" as const,
    },
    {
      icon: Package,
      label: "Productos vendidos",
      value: `${fmtNum(data.kpis.todayProducts)} uds`,
      sub: "movimiento del día",
      tone: "muted" as const,
    },
    {
      icon: AlertTriangle,
      label: "Stock bajo",
      value: fmtNum(data.kpis.lowStock),
      sub: "por debajo del mínimo",
      tone: "warning" as const,
    },
    {
      icon: XCircle,
      label: "Agotados",
      value: fmtNum(data.kpis.outStock),
      sub: "requieren reposición",
      tone: "danger" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-[1560px] px-4 pt-4 pb-8 sm:px-5 sm:pt-5 lg:px-[30px] lg:pt-[26px] lg:pb-12">
      <div className="fadeup mb-[22px] flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            {greeting}, {name}
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            Operación del día · {today}
          </p>
        </div>
        {canSell && (
          <Link
            href="/ventas"
            className="hoverlift flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-[15px] text-[13px] font-semibold text-white sm:h-[38px]"
          >
            <Plus className="size-4" /> Nueva venta
          </Link>
        )}
      </div>

      <div className="fadeup mb-[18px] grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 xl:grid-cols-5">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      <div className="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-12">
        <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm lg:col-span-8">
          <div className="flex items-center justify-between px-5 pt-[18px] pb-3.5">
            <div>
              <div className="text-[15px] font-bold tracking-tight text-foreground">
                Ventas de hoy
              </div>
              <div className="text-[12.5px] text-text-3">
                Últimas transacciones de la jornada
              </div>
            </div>
            <Link href="/ventas" className="lk text-[12.5px] font-medium text-brand">
              Abrir POS
            </Link>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[1.15fr_1.5fr_1fr_1fr_0.9fr] border-y border-border px-5 py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
                <span>Factura</span>
                <span>Cliente</span>
                <span>Método</span>
                <span className="text-right">Total</span>
                <span className="text-right">Estado</span>
              </div>
              {data.todaySales.map((sale) => {
                const st = STATUS_STYLE[sale.status] ?? STATUS_STYLE.Pagada;
                return (
                  <div
                    key={sale.inv}
                    className="tr-row grid grid-cols-[1.15fr_1.5fr_1fr_1fr_0.9fr] items-center border-b border-border px-5 py-3"
                  >
                    <span className="text-[12.5px] font-semibold text-foreground">
                      {sale.inv}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] text-foreground">
                        {sale.customer}
                      </div>
                      <div className="text-[11px] text-text-3">{sale.branch}</div>
                    </div>
                    <span className="text-[12px] text-text-2">{sale.method}</span>
                    <div className="text-right">
                      <div className="text-[12.5px] font-semibold text-foreground">
                        {fmtUSD(sale.total)}
                      </div>
                      <div className="text-[11px] text-text-3">{fmtVES(sale.ves)}</div>
                    </div>
                    <div className="text-right">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {sale.status}
                      </span>
                    </div>
                  </div>
                );
              })}
              {data.todaySales.length === 0 && (
                <div className="px-5 py-8 text-center text-[12.5px] text-text-3">
                  Sin ventas registradas hoy.
                </div>
              )}
            </div>
          </div>
        </div>

        <ListCard
          icon={Truck}
          tone="brand"
          title="Próximos pedidos"
          subtitle="Órdenes pendientes"
          className="lg:col-span-4"
        >
          {data.orders.map((order) => {
            const st = ORDER_STYLE[order.status] ?? ORDER_STYLE.Pendiente;
            return (
              <div
                key={order.code}
                className="tr-row flex items-center gap-3 border-b border-border px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-foreground">
                    {order.code}
                  </div>
                  <div className="truncate text-[11.5px] text-text-3">
                    {order.supplier} · {order.date ?? "Sin fecha"}
                  </div>
                </div>
                <span
                  className="flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{ background: st.bg, color: st.color }}
                >
                  {order.status}
                </span>
              </div>
            );
          })}
          {data.orders.length === 0 && <Empty>Sin pedidos próximos.</Empty>}
        </ListCard>
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <ListCard
          icon={AlertTriangle}
          tone="warning"
          title="Stock bajo"
          subtitle="Productos por debajo del mínimo"
        >
          {data.lowStock.map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className="tr-row flex items-center gap-3 border-b border-border px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-foreground">
                  {item.name}
                </div>
                <div className="text-[11.5px] text-text-3">{item.branch}</div>
              </div>
              <div className="flex-none text-right">
                <span
                  className="text-[13px] font-bold"
                  style={{
                    color:
                      item.cur / Math.max(item.min, 1) <= 0.33
                        ? "var(--danger)"
                        : "var(--warning)",
                  }}
                >
                  {item.cur}
                </span>
                <span className="text-[11.5px] text-text-3"> / {item.min}</span>
              </div>
            </div>
          ))}
          {data.lowStock.length === 0 && <Empty>Todo en orden.</Empty>}
        </ListCard>

        <ListCard
          icon={XCircle}
          tone="danger"
          title="Productos agotados"
          subtitle="Sin disponibilidad en stock"
        >
          {data.outStock.map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className="tr-row flex items-center gap-3 border-b border-border px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-foreground">
                  {item.name}
                </div>
                <div className="text-[11.5px] text-text-3">{item.branch}</div>
              </div>
              <Link
                href="/inventario"
                className="lk flex-none text-[11.5px] font-semibold text-brand"
              >
                Ver inventario
              </Link>
            </div>
          ))}
          {data.outStock.length === 0 && <Empty>Sin productos agotados.</Empty>}
        </ListCard>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: "brand" | "muted" | "warning" | "danger";
}) {
  const map = {
    brand: { bg: "var(--brand-soft)", color: "var(--brand)" },
    muted: { bg: "var(--surface-2)", color: "var(--text-2)" },
    warning: { bg: "var(--warning-soft)", color: "var(--warning)" },
    danger: { bg: "var(--danger-soft)", color: "var(--danger)" },
  }[tone];

  return (
    <div className="hoverlift flex flex-col gap-3 rounded-2xl border border-border bg-card p-[17px] shadow-card-sm">
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-8 flex-none items-center justify-center rounded-[9px]"
          style={{ background: map.bg, color: map.color }}
        >
          <Icon className="size-[18px]" />
        </span>
        <span className="truncate text-[12.5px] font-medium text-text-2">
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[22px] font-bold tracking-tight text-foreground">
          {value}
        </span>
        <span className="text-[11.5px] text-text-3">{sub}</span>
      </div>
    </div>
  );
}

function ListCard({
  icon: Icon,
  tone,
  title,
  subtitle,
  className = "",
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "danger" | "muted" | "warning";
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  const map = {
    brand: { bg: "var(--brand-soft)", color: "var(--brand)" },
    danger: { bg: "var(--danger-soft)", color: "var(--danger)" },
    muted: { bg: "var(--surface-2)", color: "var(--text-2)" },
    warning: { bg: "var(--warning-soft)", color: "var(--warning)" },
  }[tone];
  return (
    <div
      className={`fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm ${className}`}
    >
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

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-6 text-center text-[12.5px] text-text-3">{children}</div>;
}
