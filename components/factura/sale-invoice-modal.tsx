"use client";

/**
 * Modal con la factura de una venta ya registrada: vista previa carta, botón
 * «Imprimir factura» y «Ticket 80 mm». Lo comparten Reportes y el home
 * (Últimas ventas / Ventas de hoy) para reimprimir lo que no se imprimió al cobrar.
 */

import { useRef } from "react";
import { FileText, Receipt, X } from "lucide-react";
import type { SaleDetail } from "@/lib/queries/reports";
import {
  InvoiceDocument,
  ThermalInvoiceDocument,
  printNode,
  type InvoiceData,
  type InvoiceCompany,
} from "@/components/factura/invoice-template";

export function saleDetailToInvoice(
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

export function SaleInvoiceModal({
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
  const thermalRef = useRef<HTMLDivElement>(null);
  if (!open || !detail) return null;
  const inv = saleDetailToInvoice(detail, company, fallbackRate);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="my-6 w-full max-w-[800px] rounded-2xl bg-card shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div className="text-[15px] font-bold text-foreground">
            Venta {inv.invoiceNumber}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printNode(ref.current, `Factura ${inv.invoiceNumber}`)}
              className="hoverlift flex h-9 items-center gap-2 rounded-[10px] bg-brand px-3 text-[12.5px] font-semibold text-white"
            >
              <FileText className="size-4" /> Imprimir factura
            </button>
            <button
              onClick={() => printNode(thermalRef.current, `Ticket ${inv.invoiceNumber}`)}
              className="iconbtn flex h-9 items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground"
            >
              <Receipt className="size-4" /> Ticket 80 mm
            </button>
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Cerrar"
              className="iconbtn flex size-8 items-center justify-center rounded-md text-text-3"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="relative bg-surface-2 p-4">
          <InvoiceDocument ref={ref} data={inv} />
          <div
            aria-hidden="true"
            className="absolute top-0 left-[-10000px] overflow-hidden"
            style={{ width: 302 }}
          >
            <ThermalInvoiceDocument ref={thermalRef} data={inv} />
          </div>
        </div>
      </div>
    </div>
  );
}
