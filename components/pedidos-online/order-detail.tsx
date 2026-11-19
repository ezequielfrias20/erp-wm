"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cancelOnlineOrder, extendOnlineOrder, rejectOnlineOrder } from "@/app/(app)/pedidos-online/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reportActionError } from "@/lib/action-error";
import { fmtDateTime, fmtDual, fmtUSD } from "@/lib/format";
import { availableActions, groupByBranch, timeLeftLabel } from "@/lib/online-orders/rules";
import type { OnlineOrderView } from "@/lib/online-orders/types";
import type { TemplateKey } from "@/lib/online-orders/whatsapp";
import { AcceptDialog } from "./accept-dialog";
import { StatusBadge } from "./status-badge";
import { WhatsAppMenu } from "./whatsapp-menu";

type Branch = { id: string; name: string; city: string };
type DialogAction = "rechazar" | "extender" | "cancelar";

const GROUP_STATE = {
  pendiente: { label: "Pendiente", className: "bg-warning-soft text-warning" },
  vendido: { label: "Vendido", className: "bg-success-soft text-success" },
  liberado: { label: "Liberado", className: "bg-surface-2 text-text-3" },
} as const;

export function OrderDetail({ order, rate, canManage, branches, firmHoldHours, templates }: {
  order: OnlineOrderView;
  rate: number;
  canManage: boolean;
  branches: Branch[];
  firmHoldHours: number;
  templates: Record<TemplateKey, string>;
}) {
  const router = useRouter();
  const groups = groupByBranch(order.items);
  const actions = availableActions(order, canManage);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<DialogAction | null>(null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(String(firmHoldHours));
  const [busy, setBusy] = useState<Record<DialogAction, boolean>>({ rechazar: false, extender: false, cancelar: false });
  const [, startTransition] = useTransition();
  const locked = useRef(false);

  function openDialog(action: DialogAction) {
    setReason("");
    setHours(String(firmHoldHours));
    setDialogAction(action);
  }

  function confirmDialog() {
    const action = dialogAction;
    if (!action || locked.current || busy[action]) return;
    if (reason.length > 500) { toast.error("El motivo debe tener máximo 500 caracteres."); return; }
    const parsedHours = Number(hours);
    if (action === "extender" && (!Number.isInteger(parsedHours) || parsedHours < 1 || parsedHours > 168)) {
      toast.error("Las horas deben ser un número entero entre 1 y 168.");
      return;
    }
    locked.current = true;
    setBusy((current) => ({ ...current, [action]: true }));
    startTransition(async () => {
      try {
        const result = action === "rechazar"
          ? await rejectOnlineOrder(order.id, reason.trim() || null)
          : action === "cancelar"
            ? await cancelOnlineOrder(order.id, reason.trim() || null)
            : await extendOnlineOrder(order.id, parsedHours);
        if (result.error) { toast.error(result.error); return; }
        toast.success(action === "rechazar" ? "Pedido rechazado" : action === "cancelar" ? "Pedido cancelado" : "Reserva extendida");
        setDialogAction(null);
        router.refresh();
      } catch (error) {
        reportActionError(error, "No se pudo actualizar el pedido.");
      } finally {
        locked.current = false;
        setBusy((current) => ({ ...current, [action]: false }));
      }
    });
  }

  const dialogBusy = dialogAction ? busy[dialogAction] : false;
  return <div className="mx-auto max-w-[1200px] px-4 pt-4 pb-8 sm:px-5 sm:pt-5 lg:px-[30px] lg:pt-[26px] lg:pb-12">
    <Link href="/pedidos-online" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-text-2 hover:text-brand"><ArrowLeft className="size-4" /> Pedidos online</Link>
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-[25px] font-bold tracking-tight text-foreground">Pedido {order.number}</h1><StatusBadge status={order.status} /></div>
        <div className="mt-1 text-[13px] text-text-2">Creado {fmtDateTime(order.createdAt)} · {timeLeftLabel(order.expiresAt, new Date())}</div>
        {order.expiresAt && <div className="mt-0.5 text-[12px] text-text-3">Vence: {fmtDateTime(order.expiresAt)}</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <WhatsAppMenu order={order} groups={groups} templates={templates} />
        {actions.includes("aceptar") && <Button type="button" onClick={() => setAcceptOpen(true)} disabled={acceptOpen}>Aceptar</Button>}
        {actions.includes("rechazar") && <Button type="button" variant="outline" onClick={() => openDialog("rechazar")} disabled={busy.rechazar}>Rechazar</Button>}
        {actions.includes("extender") && <Button type="button" variant="outline" onClick={() => openDialog("extender")} disabled={busy.extender}>Extender</Button>}
        {actions.includes("cancelar") && <Button type="button" variant="outline" className="text-danger" onClick={() => openDialog("cancelar")} disabled={busy.cancelar}>Cancelar pedido</Button>}
      </div>
    </div>

    <section className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-card-sm" aria-labelledby="customer-title">
      <h2 id="customer-title" className="mb-3 text-[15px] font-semibold text-foreground">Cliente</h2>
      <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <Field label="Nombre" value={order.customerName} />
        <Field label="Teléfono" value={order.customerPhone} />
        <Field label="Correo" value={order.customerEmail} />
        <Field label="Cédula" value={order.customerDocument} />
      </div>
      {order.notes && <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm"><div className="mb-1 font-medium text-text-2">Nota del cliente</div><p className="whitespace-pre-wrap text-foreground">{order.notes}</p></div>}
      {order.closeReason && <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm"><div className="mb-1 font-medium text-text-2">Motivo de cierre</div><p className="whitespace-pre-wrap text-foreground">{order.closeReason}</p></div>}
    </section>

    {order.branchCount > 1 && <div className="mb-4 rounded-xl border border-border bg-brand-soft px-4 py-3 text-sm font-medium text-brand">Este pedido sale de {order.branchCount} tiendas: serán {order.branchCount} facturas y {order.branchCount} envíos</div>}

    <div className="space-y-4">
      {groups.map((group) => <section key={group.branchId} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm" aria-label={`Sucursal ${group.branchName}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2"><h2 className="text-[15px] font-semibold text-foreground">{group.branchName}</h2><Badge className={GROUP_STATE[group.state].className}>{GROUP_STATE[group.state].label}</Badge></div>
          <span className="text-sm font-semibold text-foreground">{fmtUSD(group.subtotal)}</span>
        </div>
        <div className="divide-y divide-border">
          {group.items.map((item) => <div key={item.id} className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_70px_110px_110px] sm:items-center">
            <div><div className="font-medium text-foreground">{item.productName}</div><div className="text-xs text-text-3">{item.variantLabel} · SKU {item.sku}</div>{item.invoiceNumber && <div className="mt-1 text-xs text-success">Factura {item.invoiceNumber}</div>}</div>
            <div className="text-text-2">{item.quantity} ×</div>
            <div className="text-text-2">{fmtUSD(item.unitPrice)}</div>
            <div className="font-semibold text-foreground">{fmtUSD(item.quantity * item.unitPrice)}</div>
          </div>)}
        </div>
      </section>)}
    </div>

    <div className="mt-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-card-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm font-semibold text-text-2">Total del pedido</span><span className="text-lg font-bold text-foreground">{fmtDual(order.total, rate)}</span></div>
    </div>

    <AcceptDialog order={order} branches={branches} open={acceptOpen} onOpenChange={setAcceptOpen} />
    <Dialog open={dialogAction !== null} onOpenChange={(open) => { if (!open && !dialogBusy) setDialogAction(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{dialogAction === "rechazar" ? "Rechazar pedido" : dialogAction === "cancelar" ? "Cancelar pedido" : "Extender reserva"}</DialogTitle></DialogHeader>
        {dialogAction === "extender" ? <div className="space-y-2"><Label htmlFor="extend-hours">Horas adicionales</Label><Input id="extend-hours" type="number" min={1} max={168} step={1} value={hours} onChange={(event) => setHours(event.target.value)} disabled={dialogBusy} /><p className="text-xs text-text-3">Entre 1 y 168 horas.</p></div>
          : <div className="space-y-2"><Label htmlFor="order-reason">Motivo (opcional)</Label><Textarea id="order-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={dialogBusy} placeholder="Escribe el motivo para el pedido" /></div>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDialogAction(null)} disabled={dialogBusy}>Volver</Button>
          <Button type="button" onClick={confirmDialog} disabled={dialogBusy} variant={dialogAction === "extender" ? "default" : "destructive"}>
            {dialogBusy && <Loader2 className="size-4 animate-spin" />}
            {dialogAction === "rechazar" ? "Confirmar rechazo" : dialogAction === "cancelar" ? "Confirmar cancelación" : "Extender reserva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return <div><div className="text-xs text-text-3">{label}</div><div className="mt-0.5 font-medium text-foreground">{value || "—"}</div></div>;
}
