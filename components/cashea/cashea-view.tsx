"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  HandCoins,
  Clock,
  CheckCircle2,
  Percent,
  ShoppingBag,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { fmtUSD, fmtVES, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settleCasheaOrder } from "@/app/(app)/cashea/actions";
import type {
  CasheaData,
  CasheaOrderRow,
  CasheaStatusFilter,
  CasheaChannelFilter,
} from "@/lib/queries/cashea";

const STATUS_FILTERS: { key: CasheaStatusFilter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "pendiente", label: "Pendientes" },
  { key: "cobrada", label: "Cobradas" },
  { key: "anulada", label: "Anuladas" },
];

const CHANNEL_FILTERS: { key: CasheaChannelFilter; label: string }[] = [
  { key: "todos", label: "Todo canal" },
  { key: "tienda", label: "Tienda" },
  { key: "online", label: "Online" },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function CasheaView({
  data,
  rate,
  range,
  status,
  channel,
  canSettle,
}: {
  data: CasheaData;
  rate: number;
  range: { from: string; to: string };
  status: CasheaStatusFilter;
  channel: CasheaChannelFilter;
  canSettle: boolean;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [applying, startApply] = useTransition();
  const [settle, setSettle] = useState<CasheaOrderRow | null>(null);

  const { orders, kpis, byChannel } = data;

  function pushFilters(next: {
    from?: string;
    to?: string;
    status?: CasheaStatusFilter;
    channel?: CasheaChannelFilter;
  }) {
    const params = new URLSearchParams({
      from: next.from ?? from,
      to: next.to ?? to,
      status: next.status ?? status,
      channel: next.channel ?? channel,
    });
    startApply(() => router.push(`/cashea?${params.toString()}`));
  }

  return (
    <div className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12">
      <div className="fadeup mb-[18px]">
        <h1 className="text-[25px] font-bold tracking-tight text-foreground">Cashea</h1>
        <p className="mt-1 text-[13.5px] text-text-2">
          Cuentas por cobrar a Cashea · tasa BCV {fmtVES(rate)}/USD
        </p>
      </div>

      {/* Filtros: estado + rango de fechas */}
      <div className="fadeup mb-[18px] flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card p-3 shadow-card-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => pushFilters({ status: f.key })}
              data-active={status === f.key}
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-text-2 transition data-[active=true]:bg-brand-soft data-[active=true]:text-brand"
            >
              {f.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          {CHANNEL_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => pushFilters({ channel: f.key })}
              data-active={channel === f.key}
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-text-2 transition data-[active=true]:bg-brand-soft data-[active=true]:text-brand"
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
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
            onClick={() => pushFilters({ from, to })}
            disabled={applying}
            className="hoverlift flex h-9 items-center gap-2 rounded-[10px] bg-brand px-4 text-[12.5px] font-semibold text-white"
          >
            {applying && <Loader2 className="size-4 animate-spin" />} Aplicar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="fadeup mb-[18px] grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          icon={ShoppingBag}
          label="Ventas Cashea"
          value={fmtUSD(kpis.ventasCashea)}
          sub={fmtVES(kpis.ventasCashea * rate)}
        />
        <Kpi
          icon={HandCoins}
          label="Inicial cobrada"
          value={fmtUSD(kpis.inicialCobrado)}
          sub={fmtVES(kpis.inicialCobrado * rate)}
        />
        <Kpi
          icon={Clock}
          label="Por cobrar a Cashea"
          value={fmtUSD(kpis.porCobrar)}
          sub={`${kpis.pendientes} pendiente(s)`}
          accent="warning"
        />
        <Kpi
          icon={CheckCircle2}
          label="Cobrado a Cashea"
          value={fmtUSD(kpis.cobrado)}
          sub={fmtVES(kpis.cobrado * rate)}
          accent="success"
        />
        <Kpi
          icon={Percent}
          label="Comisión Cashea"
          value={fmtUSD(kpis.comisionTotal)}
        />
        <Kpi
          icon={Wallet}
          label="Órdenes"
          value={String(orders.length)}
        />
      </div>

      {/* Comparativo por canal */}
      <div className="fadeup mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ChannelCard title="Cashea Tienda" stat={byChannel.tienda} rate={rate} />
        <ChannelCard title="Cashea Online" stat={byChannel.online} rate={rate} />
      </div>

      {/* Tabla de órdenes */}
      <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
        <div className="px-5 pt-[18px] pb-3.5">
          <div className="text-[15px] font-bold tracking-tight text-foreground">
            Órdenes Cashea ({orders.length})
          </div>
          <div className="text-[12.5px] text-text-3">
            Inicial = efectivo en caja · Financiado = por cobrar a Cashea
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[0.9fr_1fr_1.4fr_1.1fr_1fr_1fr_1fr_0.9fr_auto] border-y border-border px-5 py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
              <span>Factura</span>
              <span>Fecha</span>
              <span>Cliente</span>
              <span>Ref. Cashea</span>
              <span className="text-right">Total</span>
              <span className="text-right">Inicial</span>
              <span className="text-right">Financiado</span>
              <span>Estado</span>
              <span />
            </div>
            {orders.map((o) => (
              <div
                key={o.id}
                className="grid grid-cols-[0.9fr_1fr_1.4fr_1.1fr_1fr_1fr_1fr_0.9fr_auto] items-center border-b border-border px-5 py-2.5 text-[12.5px]"
              >
                <span className="truncate font-medium text-foreground">
                  {o.invoice_number ?? "—"}
                </span>
                <span className="truncate text-text-2">{fmtDate(o.created_at)}</span>
                <span className="truncate text-text-2">{o.customer ?? "Cliente general"}</span>
                <span className="truncate text-text-2">{o.reference || "—"}</span>
                <span className="text-right text-foreground">{fmtUSD(o.total)}</span>
                <span className="text-right text-text-2">{fmtUSD(o.initial_amount)}</span>
                <span className="text-right font-semibold text-foreground">
                  {o.status === "cobrada" ? (
                    <span className="text-success">{fmtUSD(o.settled_amount ?? o.financed_amount)}</span>
                  ) : (
                    fmtUSD(o.financed_amount)
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <StatusBadge status={o.status} />
                  <ChannelChip channel={o.channel} />
                </span>
                <span className="flex justify-end">
                  {o.status === "pendiente" && canSettle ? (
                    <button
                      onClick={() => setSettle(o)}
                      className="hoverlift rounded-lg border border-border bg-card px-2.5 py-1 text-[11.5px] font-semibold text-brand"
                    >
                      Marcar cobrada
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
            {orders.length === 0 && (
              <div className="px-5 py-10 text-center text-[13px] text-text-3">
                Sin órdenes Cashea en el período.
              </div>
            )}
          </div>
        </div>
      </div>

      <SettleModal
        order={settle}
        rate={rate}
        onClose={() => setSettle(null)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: CasheaOrderRow["status"] }) {
  const map = {
    pendiente: { label: "Pendiente", cls: "bg-warning-soft text-warning" },
    cobrada: { label: "Cobrada", cls: "bg-success-soft text-success" },
    anulada: { label: "Anulada", cls: "bg-surface-2 text-text-3" },
  } as const;
  const s = map[status];
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", s.cls)}>
      {s.label}
    </span>
  );
}

function ChannelChip({ channel }: { channel: CasheaOrderRow["channel"] }) {
  return (
    <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-text-2">
      {channel === "online" ? "Online" : "Tienda"}
    </span>
  );
}

function ChannelCard({
  title,
  stat,
  rate,
}: {
  title: string;
  stat: CasheaData["byChannel"]["tienda"];
  rate: number;
}) {
  const efectivoPct =
    stat.ventas > 0 && stat.cobrado + stat.comision > 0
      ? Math.round((stat.comision / (stat.cobrado + stat.comision)) * 100)
      : 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card-sm">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold tracking-tight text-foreground">{title}</span>
        <span className="text-[11.5px] text-text-3">{stat.count} orden(es)</span>
      </div>
      <div className="mt-2 text-[20px] font-bold tracking-tight text-foreground">
        {fmtUSD(stat.ventas)}
      </div>
      <div className="text-[11.5px] text-text-3">{fmtVES(stat.ventas * rate)} vendidos</div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-[12px]">
        <div>
          <div className="text-text-3">Por cobrar</div>
          <div className="font-semibold text-warning">{fmtUSD(stat.porCobrar)}</div>
        </div>
        <div>
          <div className="text-text-3">Cobrado</div>
          <div className="font-semibold text-success">{fmtUSD(stat.cobrado)}</div>
        </div>
        <div>
          <div className="text-text-3">Comisión</div>
          <div className="font-semibold text-foreground">
            {fmtUSD(stat.comision)}
            {efectivoPct > 0 ? (
              <span className="text-text-3"> ({efectivoPct}%)</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: "warning" | "success";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card-sm">
      <div className="flex items-center gap-2 text-[12px] font-medium text-text-2">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            accent === "warning"
              ? "bg-warning-soft text-warning"
              : accent === "success"
                ? "bg-success-soft text-success"
                : "bg-brand-soft text-brand",
          )}
        >
          <Icon className="size-4" />
        </span>
        {label}
      </div>
      <div className="mt-2 text-[20px] font-bold tracking-tight text-foreground">{value}</div>
      {sub ? <div className="text-[11.5px] text-text-3">{sub}</div> : null}
    </div>
  );
}

function SettleModal({
  order,
  rate,
  onClose,
}: {
  order: CasheaOrderRow | null;
  rate: number;
  onClose: () => void;
}) {
  const [settledAmount, setSettledAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  // Reinicia los campos cada vez que se abre una orden distinta.
  const [lastId, setLastId] = useState<string | null>(null);
  if (order && order.id !== lastId) {
    setLastId(order.id);
    setSettledAmount(String(order.financed_amount));
    setNotes("");
  }

  if (!order) return null;

  const settled = Number(settledAmount) || 0;
  const commission = round2(Math.max(0, order.financed_amount - settled));
  const commissionPct =
    order.financed_amount > 0 ? round2((commission / order.financed_amount) * 100) : 0;

  function confirm() {
    if (!order) return;
    if (!(settled >= 0)) {
      toast.error("Ingresa el monto depositado por Cashea.");
      return;
    }
    if (settled > order.financed_amount) {
      toast.error("El depósito no puede superar el monto financiado.");
      return;
    }
    startTransition(async () => {
      const res = await settleCasheaOrder({
        id: order.id,
        settled_amount: round2(settled),
        notes: notes.trim() || undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Orden conciliada");
      onClose();
    });
  }

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Marcar cobrada · {order.invoice_number ?? order.reference}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="rounded-[10px] bg-surface-2 px-3 py-2.5 text-[12.5px]">
            <div className="flex justify-between">
              <span className="text-text-2">Financiado por Cashea</span>
              <span className="font-semibold text-foreground">
                {fmtUSD(order.financed_amount)}
              </span>
            </div>
            <div className="flex justify-between text-text-3">
              <span>Equivalente</span>
              <span>{fmtVES(order.financed_amount * rate)}</span>
            </div>
          </div>

          <div>
            <Label className="text-[12px] text-text-2">Monto depositado por Cashea (USD)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={settledAmount}
              onChange={(e) => setSettledAmount(e.target.value)}
              className="mt-1 h-10"
            />
          </div>

          <div className="flex items-center justify-between rounded-[10px] border border-border px-3 py-2 text-[12.5px]">
            <span className="text-text-2">Comisión Cashea</span>
            <span className="font-semibold text-foreground">
              {fmtUSD(commission)} <span className="text-text-3">({commissionPct}%)</span>
            </span>
          </div>

          <div>
            <Label className="text-[12px] text-text-2">Notas (opcional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Referencia del depósito, lote, etc."
              className="mt-1 h-10"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirm} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Confirmar cobro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
