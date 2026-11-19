"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { acceptOnlineOrder } from "@/app/(app)/pedidos-online/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportActionError } from "@/lib/action-error";
import type { OnlineOrderView } from "@/lib/online-orders/types";

type Branch = { id: string; name: string; city: string };
type Draft = Record<string, { branchId: string; quantity: string }>;

export function AcceptDialog({ order, branches, open, onOpenChange }: {
  order: OnlineOrderView;
  branches: Branch[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({});
  const [pending, startTransition] = useTransition();
  const locked = useRef(false);
  const available = branches;

  function current(item: OnlineOrderView["items"][number]) {
    return draft[item.id] ?? { branchId: item.branchId, quantity: String(item.quantity) };
  }

  function update(itemId: string, patch: Partial<Draft[string]>, original: Draft[string]) {
    setDraft((prev) => ({ ...prev, [itemId]: { ...original, ...prev[itemId], ...patch } }));
  }

  function confirm() {
    if (locked.current || pending) return;
    const lines: { itemId: string; branchId: string; quantity: number }[] = [];
    for (const item of order.items) {
      const value = current(item);
      const quantity = Number(value.quantity);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > item.quantity) {
        toast.error(`La cantidad de ${item.productName} debe estar entre 0 y ${item.quantity}.`);
        return;
      }
      const changed = value.branchId !== item.branchId || quantity !== item.quantity;
      if (changed && !available.some((branch) => branch.id === value.branchId)) {
        toast.error(`Selecciona una sucursal online activa para ${item.productName}.`);
        return;
      }
      if (changed) {
        lines.push({ itemId: item.id, branchId: value.branchId, quantity });
      }
    }
    locked.current = true;
    startTransition(async () => {
      try {
        const result = await acceptOnlineOrder(order.id, lines);
        if (result.error) { toast.error(result.error); return; }
        toast.success("Pedido aceptado");
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        reportActionError(error, "No se pudo aceptar el pedido.");
      } finally {
        locked.current = false;
      }
    });
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[720px]">
      <DialogHeader><DialogTitle>Aceptar pedido · {order.number}</DialogTitle></DialogHeader>
      <p className="text-sm text-text-2">Confirma la sucursal y cantidad de cada producto. Usa 0 para quitar una línea.</p>
      <div className="space-y-3">
        {order.items.map((item) => {
          const value = current(item);
          const options = [...available].sort((a, b) => Number(b.id === item.branchId) - Number(a.id === item.branchId));
          return <div key={item.id} className="grid gap-3 rounded-xl border border-border bg-surface-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(170px,1fr)_90px] sm:items-end">
            <div className="min-w-0">
              <div className="font-medium text-foreground">{item.productName}</div>
              <div className="text-xs text-text-3">{item.variantLabel} · SKU {item.sku}</div>
            </div>
            <div className="space-y-1"><Label htmlFor={`branch-${item.id}`}>Sucursal</Label>
              <Select value={value.branchId} onValueChange={(branchId) => update(item.id, { branchId }, value)} disabled={pending}>
                <SelectTrigger id={`branch-${item.id}`} className="w-full"><SelectValue placeholder="Seleccionar sucursal" /></SelectTrigger>
                <SelectContent>{options.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name} · {branch.city}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label htmlFor={`quantity-${item.id}`}>Cantidad</Label>
              <Input id={`quantity-${item.id}`} type="number" inputMode="numeric" min={0} max={item.quantity} step={1} value={value.quantity} onChange={(event) => update(item.id, { quantity: event.target.value }, value)} disabled={pending} />
            </div>
          </div>;
        })}
      </div>
      {available.length === 0 && <p className="text-sm text-danger">No hay sucursales online activas disponibles para este pedido.</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Volver</Button>
        <Button type="button" onClick={confirm} disabled={pending || available.length === 0}>
          {pending && <Loader2 className="size-4 animate-spin" />} Confirmar aceptación
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
