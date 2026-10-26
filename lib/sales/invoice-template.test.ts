import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  InvoiceDocument,
  ThermalInvoiceDocument,
  type InvoiceData,
} from "@/components/factura/invoice-template";

const invoice: InvoiceData = {
  company: { name: "World Medics", rif: null, address: null, phone: null, logoUrl: null },
  invoiceNumber: "FAC-000001",
  date: "2026-10-26T12:00:00.000Z",
  status: "Pagada",
  branchName: null,
  customer: null,
  items: [{ description: "Uniforme", quantity: 2, unit_price: 5, line_total: 10 }],
  subtotal: 10,
  discount: 1,
  discount_pct: 10,
  tax: 1.24,
  total: 9,
  rate: 100,
  total_ves: 900,
  payments: [],
};

describe("comprobantes de venta", () => {
  it("muestra precios completos y descuento en la factura sin desglose de impuesto", () => {
    const html = renderToStaticMarkup(createElement(InvoiceDocument, { data: invoice }));

    expect(html).toContain("$5.00");
    expect(html).toContain("$10.00");
    expect(html).toContain("- $1.00");
    expect(html).toContain("$9.00");
    expect(html).not.toMatch(/\bIVA\b|G16|Exento|Base imponible/i);
  });

  it("muestra importes completos en la orden de compra sin renglones de impuesto", () => {
    const html = renderToStaticMarkup(createElement(ThermalInvoiceDocument, { data: invoice }));

    expect(html).toContain("ORDEN DE COMPRA");
    expect(html).toContain("Bs 1.000,00");
    expect(html).toContain("-Bs 100,00");
    expect(html).toContain("Bs 900,00");
    expect(html).not.toMatch(/\bIVA\b|G16|EXENTO|\(G\)/i);
  });
});
