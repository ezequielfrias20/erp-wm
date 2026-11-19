"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PosOnlineOrder } from "@/lib/queries/online-orders";

export type CompletedOnlineOrder = { orderId: string; number: string; invoice: string };

export function MissingOnlineOrderToast() {
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.warning("Ese pedido no tiene productos pendientes en esta sucursal");
  }, []);
  return null;
}

export function OnlineOrderBanner({ order, invoice, needsCustomer, creatingCustomer, onCreateCustomer, onCancel }: {
  order: PosOnlineOrder;
  invoice: string | null;
  needsCustomer: boolean;
  creatingCustomer: boolean;
  onCreateCustomer: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mb-3 rounded-xl border border-border bg-brand-soft px-4 py-3 shadow-card-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          {invoice
            ? `Pedido ${order.number}: venta ${invoice} registrada`
            : `Convirtiendo pedido ${order.number} · ${order.customer.name} · ${order.customer.phone}`}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/pedidos-online/${order.orderId}`}>Ver pedido</Link>
          </Button>
          {!invoice && needsCustomer && (
            <Button type="button" size="sm" onClick={onCreateCustomer} disabled={creatingCustomer}>
              {creatingCustomer ? "Creando cliente…" : "Crear cliente del pedido"}
            </Button>
          )}
          {!invoice && <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar conversión</Button>}
        </div>
      </div>
    </div>
  );
}

export function CompletedOnlineOrderBanner({ completed, onDismiss }: {
  completed: CompletedOnlineOrder;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-3 rounded-xl border border-border bg-success-soft px-4 py-3 shadow-card-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          Pedido {completed.number}: venta {completed.invoice} registrada
        </div>
        <div className="flex items-center gap-2">
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/pedidos-online/${completed.orderId}`}>Ver pedido</Link>
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Cerrar aviso de venta" onClick={onDismiss}>
            ×
          </Button>
        </div>
      </div>
    </div>
  );
}
