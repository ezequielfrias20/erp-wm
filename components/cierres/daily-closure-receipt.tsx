"use client";

import { forwardRef } from "react";
import type { DailyClosure, DailyClosureLine } from "@/lib/database.types";
import type { InvoiceCompany } from "@/components/factura/invoice-template";
import { fmtUSD, fmtVES } from "@/lib/format";

const localDate = new Intl.DateTimeFormat("es-VE", {
  timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric",
});
const localDateTime = new Intl.DateTimeFormat("es-VE", {
  timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});

export function closureDateLabel(value: string) {
  return localDate.format(new Date(`${value}T12:00:00Z`));
}

export function closureMoney(amount: number, currency: "USD" | "VES") {
  return currency === "USD" ? fmtUSD(amount) : fmtVES(amount);
}

function totals(rows: DailyClosureLine[], currency: "USD" | "VES") {
  const lines = rows.filter((row) => row.currency === currency);
  return {
    expected: lines.reduce((sum, row) => sum + Number(row.expected), 0),
    counted: lines.reduce((sum, row) => sum + Number(row.counted ?? 0), 0),
  };
}

export const DailyClosureReceipt = forwardRef<HTMLDivElement, {
  closure: DailyClosure;
  branchName: string;
  company: InvoiceCompany;
}>(function DailyClosureReceipt({ closure, branchName, company }, ref) {
  const rows = closure.snapshot.rows;
  const receiptCompany = closure.snapshot.company ?? company;
  const usd = totals(rows, "USD");
  const ves = totals(rows, "VES");
  const line = { borderTop: "1px dashed #000", marginTop: 8, paddingTop: 8 } as const;

  return (
    <div
      ref={ref}
      data-invoice-size="thermal-80mm"
      style={{
        boxSizing: "border-box", width: "80mm", maxWidth: "100%", padding: "5mm 4mm",
        color: "#000", background: "#fff", fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 11, lineHeight: 1.4, fontWeight: 600,
      }}
    >
      <div style={{ textAlign: "center" }}>
        {receiptCompany.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={receiptCompany.logoUrl} alt="Logo" style={{ maxWidth: "38mm", maxHeight: "15mm", objectFit: "contain" }} />
        ) : null}
        <div style={{ fontSize: 14, fontWeight: 800 }}>{receiptCompany.name ?? "World Medics"}</div>
        {receiptCompany.rif ? <div>RIF: {receiptCompany.rif}</div> : null}
        {receiptCompany.address ? <div>{receiptCompany.address}</div> : null}
        {receiptCompany.phone ? <div>Tel: {receiptCompany.phone}</div> : null}
        <div style={{ ...line, fontSize: 14, fontWeight: 800 }}>CIERRE DIARIO</div>
      </div>

      <div style={{ ...line, display: "grid", gap: 2 }}>
        <div>Fecha: {closureDateLabel(closure.business_date)}</div>
        <div>Sucursal: {closure.snapshot.branch_name || branchName}</div>
        {closure.snapshot.closed_by_name ? <div>Cerrado por: {closure.snapshot.closed_by_name}</div> : null}
        <div>Guardado: {localDateTime.format(new Date(closure.created_at))}</div>
        <div>Ventas pagadas: {closure.snapshot.sales_count}</div>
        <div>Cierre: {closure.id.slice(0, 8).toUpperCase()}</div>
      </div>

      <div style={line}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
          <span>MODALIDAD</span><span>REG. / CONF.</span>
        </div>
        {rows.map((row) => (
          <div key={`${row.source}:${row.method}:${row.currency}`} style={{ marginTop: 7 }}>
            <div style={{ fontWeight: 800 }}>
              {row.method}{row.source === "cashea_settlement" ? " (conciliado)" : ""}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Registrado</span><span>{closureMoney(row.expected, row.currency)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Confirmado</span><span>{closureMoney(row.counted ?? 0, row.currency)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Diferencia</span><span>{closureMoney(row.difference ?? 0, row.currency)}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={line}>
        <div style={{ fontWeight: 800 }}>TOTALES POR MONEDA</div>
        <div>USD: {fmtUSD(usd.expected)} registrado / {fmtUSD(usd.counted)} confirmado</div>
        <div>Diferencia USD: {fmtUSD(usd.counted - usd.expected)}</div>
        <div>VES: {fmtVES(ves.expected)} registrado / {fmtVES(ves.counted)} confirmado</div>
        <div>Diferencia VES: {fmtVES(ves.counted - ves.expected)}</div>
      </div>
      {closure.notes ? <div style={line}>Observaciones: {closure.notes}</div> : null}
      <div style={{ ...line, textAlign: "center", fontSize: 9 }}>
        Importes registrados hasta {localDateTime.format(new Date(closure.snapshot.captured_at))}.
        Las ventas posteriores no alteran este cierre.
      </div>
    </div>
  );
});
