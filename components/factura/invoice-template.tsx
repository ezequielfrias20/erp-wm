"use client";

/**
 * Plantilla de factura imprimible (HTML). Estilos inline para que imprima igual
 * sin depender del tema/CSS de la app. Se usa tanto en el POS (post-venta) como
 * en Reportes (descarga de factura por venta). La impresión se hace en un iframe
 * aislado → PDF vectorial real (no captura de pantalla).
 */

import { forwardRef } from "react";
import { fmtUSD, fmtVES, fmtDate, fmtByCurrency } from "@/lib/format";

export type InvoiceCompany = {
  name: string | null;
  rif: string | null;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
};

export type InvoiceItem = {
  description: string;
  quantity: number;
  unit_price: number; // USD
  line_total: number; // USD
};

export type InvoicePayment = {
  method: string;
  currency: "USD" | "VES";
  amount: number; // moneda nativa
  amount_usd: number;
  reference: string | null;
};

export type InvoiceData = {
  company: InvoiceCompany;
  invoiceNumber: string;
  date: string; // ISO
  status: string;
  branchName: string | null;
  cashier?: string | null;
  customer: {
    name: string | null;
    document: string | null;
    phone: string | null;
    email?: string | null;
  } | null;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  discount_pct: number;
  tax: number;
  total: number; // USD
  rate: number; // tasa BCV usada
  total_ves: number | null;
  payments: InvoicePayment[];
};

const ink = "#0B0F19";
const muted = "#64748B";
const line = "#E2E8F0";
const brand = "#0EA5E9";

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: muted,
  borderBottom: `1px solid ${line}`,
  padding: "8px 6px",
};
const td: React.CSSProperties = {
  fontSize: 12,
  color: ink,
  borderBottom: `1px solid ${line}`,
  padding: "7px 6px",
  verticalAlign: "top",
};
const rt: React.CSSProperties = { textAlign: "right" };

export const InvoiceDocument = forwardRef<HTMLDivElement, { data: InvoiceData }>(
  function InvoiceDocument({ data }, ref) {
    const c = data.company;
    return (
      <div
        ref={ref}
        style={{
          width: 720,
          maxWidth: "100%",
          margin: "0 auto",
          padding: 28,
          background: "#fff",
          color: ink,
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          boxSizing: "border-box",
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            borderBottom: `2px solid ${brand}`,
            paddingBottom: 16,
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {c.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.logoUrl}
                alt="Logo"
                crossOrigin="anonymous"
                style={{ height: 52, width: "auto", objectFit: "contain" }}
              />
            ) : null}
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {c.name ?? "World Medics"}
              </div>
              {c.rif ? <div style={{ fontSize: 12, color: muted }}>RIF: {c.rif}</div> : null}
              {c.address ? (
                <div style={{ fontSize: 11, color: muted }}>{c.address}</div>
              ) : null}
              {c.phone ? <div style={{ fontSize: 11, color: muted }}>Tel: {c.phone}</div> : null}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: brand }}>FACTURA</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>N° {data.invoiceNumber}</div>
            <div style={{ fontSize: 11, color: muted }}>{fmtDate(data.date)}</div>
            <div style={{ fontSize: 11, color: muted }}>Estado: {data.status}</div>
            {data.branchName ? (
              <div style={{ fontSize: 11, color: muted }}>Sucursal: {data.branchName}</div>
            ) : null}
          </div>
        </div>

        {/* Cliente */}
        <div style={{ marginTop: 16, display: "flex", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...th, border: "none", padding: "0 0 4px" }}>Cliente</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {data.customer?.name ?? "Sin cliente asociado"}
            </div>
            {data.customer?.document ? (
              <div style={{ fontSize: 12, color: muted }}>
                Documento: {data.customer.document}
              </div>
            ) : null}
            {data.customer?.phone ? (
              <div style={{ fontSize: 12, color: muted }}>Tel: {data.customer.phone}</div>
            ) : null}
            {data.customer?.email ? (
              <div style={{ fontSize: 12, color: muted }}>{data.customer.email}</div>
            ) : null}
          </div>
          {data.cashier ? (
            <div style={{ textAlign: "right" }}>
              <div style={{ ...th, border: "none", padding: "0 0 4px" }}>Atendido por</div>
              <div style={{ fontSize: 12 }}>{data.cashier}</div>
            </div>
          ) : null}
        </div>

        {/* Items */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th style={th}>Descripción</th>
              <th style={{ ...th, ...rt, width: 60 }}>Cant.</th>
              <th style={{ ...th, ...rt, width: 110 }}>Precio</th>
              <th style={{ ...th, ...rt, width: 110 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i}>
                <td style={td}>{it.description}</td>
                <td style={{ ...td, ...rt }}>{it.quantity}</td>
                <td style={{ ...td, ...rt }}>{fmtUSD(it.unit_price)}</td>
                <td style={{ ...td, ...rt }}>{fmtUSD(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <table style={{ width: 320, borderCollapse: "collapse" }}>
            <tbody>
              <Row label="Subtotal" value={fmtUSD(data.subtotal)} />
              {data.discount > 0 ? (
                <Row
                  label={`Descuento (${data.discount_pct}%)`}
                  value={`- ${fmtUSD(data.discount)}`}
                />
              ) : null}
              <Row label="IVA (16%)" value={fmtUSD(data.tax)} />
              <tr>
                <td style={{ ...td, fontWeight: 800, fontSize: 14, borderBottom: "none" }}>
                  Total
                </td>
                <td
                  style={{
                    ...td,
                    ...rt,
                    fontWeight: 800,
                    fontSize: 14,
                    borderBottom: "none",
                  }}
                >
                  {fmtUSD(data.total)}
                </td>
              </tr>
              <tr>
                <td style={{ ...td, color: muted, borderBottom: "none", paddingTop: 0 }}>
                  Equivalente Bs.
                </td>
                <td
                  style={{ ...td, ...rt, color: muted, borderBottom: "none", paddingTop: 0 }}
                >
                  {fmtVES(data.total_ves ?? data.total * data.rate)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Pagos */}
        {data.payments.length > 0 ? (
          <div style={{ marginTop: 18 }}>
            <div style={{ ...th, border: "none", padding: "0 0 6px" }}>
              Pagos · Tasa BCV {fmtVES(data.rate)}/USD
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Método</th>
                  <th style={th}>Referencia</th>
                  <th style={{ ...th, ...rt }}>Monto</th>
                  <th style={{ ...th, ...rt, width: 110 }}>Equiv. USD</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p, i) => (
                  <tr key={i}>
                    <td style={td}>
                      {p.method}{" "}
                      <span style={{ color: muted, fontSize: 10 }}>({p.currency})</span>
                    </td>
                    <td style={{ ...td, color: muted }}>{p.reference ?? "—"}</td>
                    <td style={{ ...td, ...rt }}>{fmtByCurrency(p.amount, p.currency, data.rate)}</td>
                    <td style={{ ...td, ...rt }}>{fmtUSD(p.amount_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div
          style={{
            marginTop: 26,
            paddingTop: 12,
            borderTop: `1px solid ${line}`,
            fontSize: 10.5,
            color: muted,
            textAlign: "center",
          }}
        >
          Gracias por su compra · {c.name ?? "World Medics"} · Documento generado por World
          Medics ERP
        </div>
      </div>
    );
  },
);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ ...td, color: muted, borderBottom: "none", padding: "4px 6px" }}>{label}</td>
      <td style={{ ...td, ...rt, borderBottom: "none", padding: "4px 6px" }}>{value}</td>
    </tr>
  );
}

/**
 * Imprime un nodo del DOM en un iframe aislado (no arrastra el chrome de la app).
 * Espera a que carguen las imágenes (logo) antes de lanzar el diálogo de impresión.
 */
export function printNode(node: HTMLElement | null, title = "Factura"): void {
  if (!node) return;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  } as CSSStyleDeclaration);
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>@page{margin:12mm} html,body{margin:0;padding:0;background:#fff;` +
      `font-family:Inter,system-ui,-apple-system,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>` +
      `</head><body>${node.outerHTML}</body></html>`,
  );
  doc.close();

  const win = iframe.contentWindow!;
  let printed = false;
  const launch = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 1000);
  };

  const imgs = Array.from(doc.images);
  if (imgs.length === 0) {
    setTimeout(launch, 60);
    return;
  }
  let loaded = 0;
  const tick = () => {
    loaded += 1;
    if (loaded >= imgs.length) launch();
  };
  imgs.forEach((im) => {
    if (im.complete) tick();
    else {
      im.onload = tick;
      im.onerror = tick;
    }
  });
  // Respaldo por si alguna imagen nunca dispara onload.
  setTimeout(launch, 1500);
}
