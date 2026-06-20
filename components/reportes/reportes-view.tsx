"use client";

import { useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  FileDown,
  SlidersHorizontal,
  Calendar,
  Store,
  TrendingUp,
  Wallet,
  Percent,
  Receipt,
} from "lucide-react";
import { fmtUSD, fmtUSDShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReportData } from "@/lib/queries/reports";

const TABS = ["Resumen", "Por categoría", "Por método de pago"] as const;

export function ReportesView({
  data,
  branchLabel,
}: {
  data: ReportData;
  branchLabel: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resumen");
  const { kpis, monthly, trend } = data;
  const trendMax = Math.max(1, ...trend.map((t) => t.value));
  const breakdown = tab === "Por método de pago" ? data.byPayment : data.byCategory;
  const breakTotal = breakdown.reduce((a, b) => a + b.value, 0);

  function exportCsv() {
    const head = ["Mes", "Ingresos", "Costo", "Ganancia", "Margen", "Transacciones"];
    const rows = monthly.map((m) =>
      [m.mes, m.ingresos, m.costo, m.ganancia, `${m.margen}%`, m.tx].join(","),
    );
    const blob = new Blob([[head.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reporte-world-medics.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12">
      <div className="fadeup mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            Reportes
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            Centro de inteligencia de negocio · análisis y exportación
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportBtn icon={FileText} label="PDF" onClick={() => window.print()} />
          <ExportBtn icon={FileSpreadsheet} label="Excel" onClick={exportCsv} />
          <ExportBtn icon={FileDown} label="CSV" onClick={exportCsv} />
        </div>
      </div>

      {/* Filters */}
      <div className="fadeup mb-[18px] flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-card-sm">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-2">
          <SlidersHorizontal className="size-4" /> Filtros
        </span>
        <Chip icon={Calendar} label={`01 ene – hoy ${new Date().getFullYear()}`} />
        <Chip icon={Store} label={`Sucursal: ${branchLabel}`} />
      </div>

      {/* Report type cards */}
      <div className="fadeup mb-[18px] grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-active={tab === t}
            className="hoverlift flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 text-left text-[13px] font-semibold shadow-card-sm data-[active=true]:ring-2 data-[active=true]:ring-brand"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <TrendingUp className="size-4" />
            </span>
            {t}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="fadeup mb-[18px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Ingresos" value={fmtUSDShort(kpis.ingresos)} />
        <Kpi icon={Wallet} label="Ganancia" value={fmtUSDShort(kpis.ganancia)} />
        <Kpi icon={Percent} label="Margen" value={`${kpis.margen.toFixed(1)}%`} />
        <Kpi icon={Receipt} label="Transacciones" value={String(kpis.transacciones)} />
      </div>

      {/* Trend + breakdown */}
      <div className="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.5fr_1fr]">
        <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
          <div className="mb-4 text-[15px] font-bold tracking-tight text-foreground">
            Tendencia mensual · Ingresos
          </div>
          <div className="flex h-[220px] items-end gap-2">
            {trend.map((t) => (
              <div key={t.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${(t.value / trendMax) * 100}%`,
                      minHeight: t.value > 0 ? 4 : 0,
                      background: "linear-gradient(180deg,var(--brand),var(--brand-2))",
                    }}
                    title={fmtUSD(t.value)}
                  />
                </div>
                <span className="text-[10.5px] text-text-3">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
          <div className="mb-4 text-[15px] font-bold tracking-tight text-foreground">
            {tab === "Por método de pago" ? "Por método de pago" : "Por categoría"}
          </div>
          <div className="flex flex-col gap-3.5">
            {breakdown.map((b) => (
              <div key={b.name}>
                <div className="mb-1.5 flex justify-between text-[12.5px]">
                  <span className="flex items-center gap-1.5 text-text-2">
                    <span className="size-2.5 rounded-[3px]" style={{ background: b.color }} />
                    {b.name}
                  </span>
                  <span className="font-semibold text-foreground">
                    {breakTotal ? Math.round((b.value / breakTotal) * 100) : 0}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${breakTotal ? (b.value / breakTotal) * 100 : 0}%`, background: b.color }}
                  />
                </div>
              </div>
            ))}
            {breakdown.length === 0 && (
              <span className="text-[12px] text-text-3">Sin datos en el período.</span>
            )}
          </div>
        </div>
      </div>

      {/* Detail table */}
      <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
        <div className="flex items-center justify-between px-5 pt-[18px] pb-3.5">
          <div>
            <div className="text-[15px] font-bold tracking-tight text-foreground">
              Detalle mensual
            </div>
            <div className="text-[12.5px] text-text-3">Desglose exportable por período</div>
          </div>
          <button
            onClick={exportCsv}
            className="iconbtn flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12px] font-medium text-foreground"
          >
            <FileDown className="size-3.5 text-text-3" /> Exportar tabla
          </button>
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_0.8fr_0.8fr] border-y border-border px-5 py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
          <span>Mes</span>
          <span className="text-right">Ingresos</span>
          <span className="text-right">Costo</span>
          <span className="text-right">Ganancia</span>
          <span className="text-right">Margen</span>
          <span className="text-right">Transacc.</span>
        </div>
        {monthly.map((m) => (
          <div
            key={m.mes}
            className="tr-row grid grid-cols-[1fr_1fr_1fr_1fr_0.8fr_0.8fr] items-center border-b border-border px-5 py-2.5 text-[12.5px]"
          >
            <span className="font-medium text-foreground">{m.mes}</span>
            <span className="text-right text-foreground">{fmtUSD(m.ingresos)}</span>
            <span className="text-right text-text-2">{fmtUSD(m.costo)}</span>
            <span className="text-right font-semibold text-success">{fmtUSD(m.ganancia)}</span>
            <span className="text-right text-foreground">{m.margen}%</span>
            <span className="text-right text-text-2">{m.tx}</span>
          </div>
        ))}
        {monthly.length === 0 && (
          <div className="px-5 py-10 text-center text-[13px] text-text-3">
            Sin ventas registradas en el período.
          </div>
        )}
      </div>
    </div>
  );
}

function ExportBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="iconbtn flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-card px-[13px] text-[13px] font-medium text-foreground"
    >
      <Icon className="size-4 text-text-3" /> {label}
    </button>
  );
}

function Chip({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-[12px] font-medium text-text-2">
      <Icon className="size-3.5 text-text-3" /> {label}
    </span>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card-sm">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-text-2">{label}</span>
        <Icon className="size-4 text-text-3" />
      </div>
      <div className="mt-2 text-[22px] font-bold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}
