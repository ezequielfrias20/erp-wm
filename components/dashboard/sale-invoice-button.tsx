"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadSaleInvoice, type SaleInvoicePayload } from "@/app/(app)/dashboard/actions";
import { SaleInvoiceModal } from "@/components/factura/sale-invoice-modal";

/**
 * Estado compartido de «ver factura» en las tablas de ventas del home: un único
 * modal por tabla y el id de la fila que está cargando.
 */
export function useSaleInvoiceViewer(fallbackRate: number) {
  const [payload, setPayload] = useState<SaleInvoicePayload | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function show(id: string) {
    if (loadingId) return;
    setLoadingId(id);
    try {
      const res = await loadSaleInvoice(id);
      if (!res) {
        toast.error("No se pudo cargar la factura.");
        return;
      }
      setPayload(res);
      setOpen(true);
    } catch {
      toast.error("No se pudo cargar la factura. Revisa la conexión e intenta de nuevo.");
    } finally {
      setLoadingId(null);
    }
  }

  const modal = payload ? (
    <SaleInvoiceModal
      open={open}
      onOpenChange={setOpen}
      detail={payload.detail}
      company={payload.company}
      fallbackRate={fallbackRate}
    />
  ) : null;

  return { show, loadingId, modal };
}

export function SaleInvoiceButton({
  invoice,
  loading,
  onClick,
}: {
  invoice: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={`Ver factura ${invoice}`}
      aria-label={`Ver factura ${invoice}`}
      className="iconbtn inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-text-2 hover:text-brand disabled:opacity-60"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
    </button>
  );
}
