"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  FileSpreadsheet,
  FileDown,
  Store,
  TrendingUp,
  Wallet,
  Percent,
  Receipt,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { fmtUSD, fmtUSDShort, fmtVES, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReportData, SaleDetail } from "@/lib/queries/reports";
import { loadSaleDetail } from "@/app/(app)/reportes/actions";
import { downloadReportPdf } from "@/components/reportes/report-pdf";
import {
  InvoiceDocument,
  printNode,
  type InvoiceData,
  type InvoiceCompany,
} from "@/components/factura/invoice-template";

const TABS = ["Resumen", "Por categoría", "Por método de pago"] as const;

export function ReportesView({
  data,
  branchLabel,
  company,
}: {
  data: ReportData;
  branchLabel: string;
  company: InvoiceCompany;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resumen");
  const [from, setFrom] = useState(data.range.from);
  const [to, setTo] = useState(data.range.to);
  const [applying, startApply] = useTransition();
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const { kpis, monthly, trend, rate, sales } = data;
  const trendMax = Math.max(1, ...trend.map((t) => t.value));

  const breakdown =
    tab === "Por método de pago"
      ? data.byPayment.map((p) => ({ name: p.name, value: p.usd, color: p.color }))
      : data.byCategory;
  const breakTotal = breakdown.reduce((a, b) => a + b.value, 0);

  function applyRange() {
    startApply(() => {
      router.push(`/reportes?from=${from}&to=${to}`);
    });
  }

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
    a.download = `reporte-world-medics-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    setPdfBusy(true);
    try {
      await downloadReportPdf(data, company, branchLabel);
    } catch (e) {
      toast.error("No se pudo generar el PDF.");
      console.error(e);
    } finally {
      setPdfBusy(false);
    }
  }

  async function openDetail(id: string) {
    setLoadingId(id);
    const d = await loadSaleDetail(id);
    setLoadingId(null);
    if (!d) {
      toast.error("No se pudo cargar la venta.");
      return;
    }
    setDetail(d);
    setDetailOpen(true);
  }

  return (
    <div className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12">
      <div className="fadeup mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">Reportes</h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            Centro de inteligencia de negocio · tasa BCV {fmtVES(rate)}/USD
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportBtn
            icon={pdfBusy ? Loader2 : FileText}
            label="PDF"
            onClick={exportPdf}
            spin={pdfBusy}
          />
          <ExportBtn icon={FileSpreadsheet} label="Excel" onClick={exportCsv} />
          <ExportBtn icon={FileDown} label="CSV" onClick={exportCsv} />
        </div>
      </div>

      {/* Filtros: rango de fechas + sucursal */}
      <div className="fadeup mb-[18px] flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card p-3 shadow-card-sm">
        <div className="flex items-center gap-1.5 text-[12.5px] text-text-2">
          <span className="font-semibold">Desde</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-[10px] border border-border bg-surface-2 px-2.5 text-[12.5px] text-foreground outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 text-[12.5px] text-text-2">
          <span className="font-semibold">Hasta</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-[10px] border border-border bg-surface-2 px-2.5 text-[12.5px] text-foreground outline-none"
          />
        </div>
        <button
          onClick={applyRange}
          disabled={applying}
          className="hoverlift flex h-9 items-center gap-2 rounded-[10px] bg-brand px-4 text-[12.5px] font-semibold text-white"
        >
          {applying && <Loader2 className="size-4 animate-spin" />} Aplicar
        </button>
        <span className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-[12px] font-medium text-text-2">
          <Store className="size-3.5 text-text-3" /> Sucursal: {branchLabel}
        </span>
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
        <Kpi
          icon={TrendingUp}
          label="Ingresos"
          value={fmtUSDShort(kpis.ingresos)}
          sub={fmtVES(kpis.ingresos * rate)}
        />
        <Kpi
          icon={Wallet}
          label="Ganancia"
          value={fmtUSDShort(kpis.ganancia)}
          sub={fmtVES(kpis.ganancia * rate)}
        />
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
            {trend.length === 0 && (
              <span className="text-[12px] text-text-3">Sin datos en el período.</span>
            )}
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
                    {fmtUSD(b.value)} ·{" "}
                    {breakTotal ? Math.round((b.value / breakTotal) * 100) : 0}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${breakTotal ? (b.value / breakTotal) * 100 : 0}%`,
                      background: b.color,
                    }}
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

      {/* Desglose por método de pago (moneda nativa + USD + tasa) */}
      <div className="fadeup mb-[18px] overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
        <div className="px-5 pt-[18px] pb-3.5">
          <div className="text-[15px] font-bold tracking-tight text-foreground">
            Facturado por método de pago
          </div>
          <div className="text-[12.5px] text-text-3">
            Montos en su moneda nativa con su equivalente · tasa {fmtVES(rate)}/USD
          </div>
        </div>
        <div className="grid grid-cols-[1.4fr_0.8fr_1fr_1fr] border-y border-border px-5 py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
          <span>Método</span>
          <span>Moneda</span>
          <span className="text-right">Monto nativo</span>
          <span className="text-right">Equivalente USD</span>
        </div>
        {data.byPayment.map((p) => (
          <div
            key={p.name}
            className="grid grid-cols-[1.4fr_0.8fr_1fr_1fr] items-center border-b border-border px-5 py-2.5 text-[12.5px]"
          >
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} />
              {p.name}
              {p.is_financed && (
                <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                  por cobrar
                </span>
              )}
            </span>
            <span className="text-text-2">{p.currency}</span>
            <span className="text-right text-foreground">
              {p.currency === "VES" ? fmtVES(p.native) : fmtUSD(p.native)}
            </span>
            <span className="text-right font-semibold text-foreground">{fmtUSD(p.usd)}</span>
          </div>
        ))}
        {data.byPayment.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-text-3">
            Sin pagos en el período.
          </div>
        )}
      </div>

      {/* Cashea · conciliación */}
      {data.cashea.ventasCashea > 0 && (
        <div className="fadeup mb-[18px] overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
          <div className="px-5 pt-[18px] pb-3.5">
            <div className="text-[15px] font-bold tracking-tight text-foreground">
              Cashea · conciliación
            </div>
            <div className="text-[12.5px] text-text-3">
              Inicial = efectivo en caja · Financiado = cuenta por cobrar a Cashea
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
            <CasheaStat label="Ventas Cashea" value={fmtUSD(data.cashea.ventasCashea)} />
            <CasheaStat label="Inicial cobrada" value={fmtUSD(data.cashea.inicialCobrado)} />
            <CasheaStat
              label="Por cobrar"
              value={fmtUSD(data.cashea.porCobrar)}
              tone="warning"
            />
            <CasheaStat
              label="Cobrado a Cashea"
              value={fmtUSD(data.cashea.cobrado)}
              tone="success"
            />
            <CasheaStat label="Comisión" value={fmtUSD(data.cashea.comisionTotal)} />
          </div>
          <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] border-t border-border px-5 py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
            <span>Canal</span>
            <span className="text-right">Ventas</span>
            <span className="text-right">Por cobrar</span>
            <span className="text-right">Comisión</span>
          </div>
          {(
            [
              { label: "Tienda", c: data.cashea.tienda },
              { label: "Online", c: data.cashea.online },
            ] as const
          ).map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center border-b border-border px-5 py-2.5 text-[12.5px] last:border-b-0"
            >
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="text-right text-foreground">{fmtUSD(row.c.ventas)}</span>
              <span className="text-right text-warning">{fmtUSD(row.c.porCobrar)}</span>
              <span className="text-right text-text-2">{fmtUSD(row.c.comision)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Ventas del período */}
      <div className="fadeup mb-[18px] overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
        <div className="px-5 pt-[18px] pb-3.5">
          <div className="text-[15px] font-bold tracking-tight text-foreground">
            Ventas del período ({sales.length})
          </div>
          <div className="text-[12.5px] text-text-3">
            Toca una venta para ver el detalle y descargar la factura
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[0.9fr_1.1fr_1.6fr_1.1fr_1fr_0.9fr_auto] border-y border-border px-5 py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
              <span>Factura</span>
              <span>Fecha</span>
              <span>Cliente</span>
              <span>Método</span>
              <span className="text-right">Total</span>
              <span className="text-right">Bs.</span>
              <span />
            </div>
            {sales.map((v) => (
              <button
                key={v.id}
                onClick={() => openDetail(v.id)}
                className="tr-row grid w-full grid-cols-[0.9fr_1.1fr_1.6fr_1.1fr_1fr_0.9fr_auto] items-center border-b border-border px-5 py-2.5 text-left text-[12.5px]"
              >
                <span className="truncate font-medium text-foreground">{v.invoice_number}</span>
                <span className="truncate text-text-2">{fmtDate(v.created_at)}</span>
                <span className="truncate text-text-2">{v.customer ?? "Cliente general"}</span>
                <span className="truncate text-text-2">{v.payment_method ?? "—"}</span>
                <span className="text-right font-semibold text-foreground">{fmtUSD(v.total)}</span>
                <span className="text-right text-text-3">
                  {fmtVES(v.total_ves ?? v.total * rate)}
                </span>
                <span className="flex justify-end">
                  {loadingId === v.id ? (
                    <Loader2 className="size-4 animate-spin text-text-3" />
                  ) : (
                    <FileText className="size-4 text-text-3" />
                  )}
                </span>
              </button>
            ))}
            {sales.length === 0 && (
              <div className="px-5 py-10 text-center text-[13px] text-text-3">
                Sin ventas registradas en el período.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detalle mensual */}
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

      <SaleDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detail={detail}
        company={company}
        fallbackRate={rate}
      />
    </div>
  );
}

function detailToInvoice(
  d: SaleDetail,
  company: InvoiceCompany,
  fallbackRate: number,
): InvoiceData {
  const rate = d.sale.exchange_rate ?? fallbackRate;
  return {
    company,
    invoiceNumber: d.sale.invoice_number,
    date: d.sale.created_at,
    status: d.sale.status,
    branchName: d.branchName,
    cashier: d.cashier,
    customer: d.customer
      ? {
          name: d.customer.name,
          document: d.customer.document,
          phone: d.customer.phone,
          email: d.customer.email,
        }
      : null,
    items: d.items.map((it) => ({
      description: it.description ?? "—",
      quantity: it.quantity,
      unit_price: it.unit_price,
      line_total: it.line_total,
    })),
    subtotal: d.sale.subtotal,
    discount: d.sale.discount,
    discount_pct: d.sale.discount_pct,
    tax: d.sale.tax,
    total: d.sale.total,
    rate,
    total_ves: d.sale.total_ves,
    payments: d.payments.map((p) => ({
      method: p.method,
      currency: (p.currency ?? "VES") as "USD" | "VES",
      amount: p.amount,
      amount_usd: p.amount_usd,
      reference: p.reference,
      is_financed: p.is_financed,
    })),
  };
}

function SaleDetailModal({
  open,
  onOpenChange,
  detail,
  company,
  fallbackRate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  detail: SaleDetail | null;
  company: InvoiceCompany;
  fallbackRate: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  if (!open || !detail) return null;
  const inv = detailToInvoice(detail, company, fallbackRate);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="my-6 w-full max-w-[800px] rounded-2xl bg-card shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-[15px] font-bold text-foreground">
            Venta {inv.invoiceNumber}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printNode(ref.current, `Factura ${inv.invoiceNumber}`)}
              className="hoverlift flex h-9 items-center gap-2 rounded-[10px] bg-brand px-3 text-[12.5px] font-semibold text-white"
            >
              <FileText className="size-4" /> Descargar factura
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="iconbtn flex size-8 items-center justify-center rounded-md text-text-3"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="bg-surface-2 p-4">
          <InvoiceDocument ref={ref} data={inv} />
        </div>
      </div>
    </div>
  );
}

function ExportBtn({
  icon: Icon,
  label,
  onClick,
  spin,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  spin?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="iconbtn flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-card px-[13px] text-[13px] font-medium text-foreground"
    >
      <Icon className={cn("size-4 text-text-3", spin && "animate-spin")} /> {label}
    </button>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card-sm">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-text-2">{label}</span>
        <Icon className="size-4 text-text-3" />
      </div>
      <div className="mt-2 text-[22px] font-bold tracking-tight text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-text-3">{sub}</div>}
    </div>
  );
}

function CasheaStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "success";
}) {
  return (
    <div className="bg-card px-5 py-3.5">
      <div className="text-[11.5px] text-text-3">{label}</div>
      <div
        className={cn(
          "mt-1 text-[16px] font-bold tracking-tight",
          tone === "warning"
            ? "text-warning"
            : tone === "success"
              ? "text-success"
              : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
