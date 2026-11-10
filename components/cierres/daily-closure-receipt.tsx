"use client";

import { forwardRef } from "react";
import type { DailyClosure } from "@/lib/database.types";
import type { InvoiceCompany } from "@/components/factura/invoice-template";
import { groupClosureRows } from "@/lib/closure-groups";
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


export const DailyClosureReceipt = forwardRef<HTMLDivElement, {
  closure: DailyClosure;
  branchName: string;
  company: InvoiceCompany;
}>(function DailyClosureReceipt({ closure, branchName, company }, ref) {
  const groups = groupClosureRows(closure.snapshot.rows);
  const receiptCompany = closure.snapshot.company ?? company;
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

      {groups.map((group) => (
        <div key={group.key} style={line}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>{group.title}</div>
          {group.key !== "caja" ? <div style={{ fontSize: 9 }}>Cuenta aparte · no suma a la caja</div> : null}
          {group.rows.map((row) => (
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
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #000" }}>
            <div style={{ fontWeight: 800 }}>TOTAL {group.title.toUpperCase()}</div>
            {group.totals.map((total) => (
              <div key={total.currency}>
                <div>{total.currency}: {closureMoney(total.expected, total.currency)} reg. / {closureMoney(total.counted, total.currency)} conf.</div>
                <div>Diferencia {total.currency}: {closureMoney(total.counted - total.expected, total.currency)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {closure.notes ? <div style={line}>Observaciones: {closure.notes}</div> : null}
      <div style={{ ...line, textAlign: "center", fontSize: 9 }}>
        Importes registrados hasta {localDateTime.format(new Date(closure.snapshot.captured_at))}.
        Las ventas posteriores no alteran este cierre.
      </div>
    </div>
  );
});
