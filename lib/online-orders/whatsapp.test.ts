import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, buildWhatsAppUrl, renderTemplate, templateVars } from "./whatsapp";
import type { BranchGroup, OnlineOrderView } from "./types";

const order: OnlineOrderView = {
  id: "o1", number: "PED-001", status: "aceptada", storedStatus: "aceptada",
  customerName: "Ana María Pérez", customerPhone: "+584141234567", customerEmail: null,
  customerDocument: null, notes: null, createdAt: "2026-11-19T10:00:00Z",
  expiresAt: "2026-11-19T14:30:00Z", softExpiresAt: "2026-11-19T12:00:00Z",
  firmExpiresAt: "2026-11-19T14:30:00Z", total: 125, branchCount: 2,
  closeReason: null, items: [],
};
const groups: BranchGroup[] = [
  { branchId: "A", branchName: "Caracas Centro", subtotal: 62.5, state: "pendiente", items: [{
    id: "a1", variantId: "v1", branchId: "A", branchName: "Caracas Centro",
    quantity: 2, unitPrice: 31.25, productName: "Bata", variantLabel: "Azul",
    sku: "SKU-1", saleId: null, invoiceNumber: null, releasedAt: null,
  }] },
  { branchId: "B", branchName: "Valencia", subtotal: 62.5, state: "pendiente", items: [{
    id: "b1", variantId: "v2", branchId: "B", branchName: "Valencia",
    quantity: 1, unitPrice: 62.5, productName: "Pijama", variantLabel: "M",
    sku: "SKU-2", saleId: null, invoiceNumber: null, releasedAt: null,
  }] },
];
const now = new Date("2026-11-19T10:00:00Z");

describe("plantillas de WhatsApp", () => {
  it("conserva exactamente el texto predeterminado y los saltos de línea", () => {
    expect(DEFAULT_TEMPLATES).toEqual({
      recibida: "Hola {nombre}, recibimos tu solicitud {numero}. La estamos revisando y te escribimos por aquí para confirmar disponibilidad y pago.",
      aceptada: "Hola {nombre}, confirmamos tu pedido {numero}:\n{lineas}\nTotal: {total}\n{sucursales}\nTus productos quedan apartados hasta {vence}. Para pagar te indicamos los datos por este medio.",
      rechazada: "Hola {nombre}, lamentablemente no podemos procesar tu solicitud {numero}.{motivo} Disculpa las molestias.",
      no_disponible: "Hola {nombre}, sobre tu solicitud {numero}: algunos productos ya no están disponibles. ¿Te ofrecemos una alternativa?",
      por_vencer: "Hola {nombre}, tu pedido {numero} vence {vence}. ¿Confirmamos el pago para no liberar los productos?",
    });
  });

  it("reemplaza sólo las variables conocidas y todas sus apariciones", () => {
    expect(renderTemplate("Hola {nombre} {foo}. {nombre}", { nombre: "Ana" })).toBe("Hola Ana {foo}. Ana");
  });

  it("prepara nombres, líneas, total y sucursales", () => {
    const vars = templateVars(order, groups, now);
    expect(vars.nombre).toBe("Ana");
    expect(vars.numero).toBe("PED-001");
    expect(vars.lineas).toBe("• 2 × Bata (Azul) — $31.25\n• 1 × Pijama (M) — $62.50");
    expect(vars.total).toBe("$125.00");
    expect(vars.sucursales).toBe("Sale de: Caracas Centro, Valencia · serán 2 facturas y 2 envíos");
    expect(vars.vence).toContain("10:30");
    expect(vars.motivo).toBe("");
  });

  it("no anuncia facturas múltiples para una sucursal", () => {
    expect(templateVars(order, groups.slice(0, 1), now).sucursales).toBe("Sale de: Caracas Centro");
  });

  it("agrega el motivo de cierre sólo cuando existe", () => {
    expect(templateVars({ ...order, status: "rechazada", storedStatus: "rechazada", closeReason: "Sin stock" }, [], now).motivo).toBe(" Motivo: Sin stock.");
  });
});

describe("buildWhatsAppUrl", () => {
  it("codifica el mensaje para un número E.164 válido", () => {
    expect(buildWhatsAppUrl("+584141234567", "Hola ñ")).toBe("https://wa.me/584141234567?text=Hola%20%C3%B1");
  });

  it("rechaza números locales o fuera de rango", () => {
    expect(buildWhatsAppUrl("04141234567", "x")).toBeNull();
    expect(buildWhatsAppUrl("+0123456789", "x")).toBeNull();
    expect(buildWhatsAppUrl("+1234567", "x")).toBeNull();
  });
});
