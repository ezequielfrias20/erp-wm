import { fmtUSD } from "@/lib/format";
import type { BranchGroup, OnlineOrderView } from "./types";

export type TemplateKey = "recibida" | "aceptada" | "rechazada" | "no_disponible" | "por_vencer";

export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  recibida: "Hola {nombre}, recibimos tu solicitud {numero}. La estamos revisando y te escribimos por aquí para confirmar disponibilidad y pago.",
  aceptada: "Hola {nombre}, confirmamos tu pedido {numero}:\n{lineas}\nTotal: {total}\n{sucursales}\nTus productos quedan apartados hasta {vence}. Para pagar te indicamos los datos por este medio.",
  rechazada: "Hola {nombre}, lamentablemente no podemos procesar tu solicitud {numero}.{motivo} Disculpa las molestias.",
  no_disponible: "Hola {nombre}, sobre tu solicitud {numero}: algunos productos ya no están disponibles. ¿Te ofrecemos una alternativa?",
  por_vencer: "Hola {nombre}, tu pedido {numero} vence {vence}. ¿Confirmamos el pago para no liberar los productos?",
};

const caracasDateTime = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  hour12: false, timeZone: "America/Caracas",
});

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^{}]+)\}/g, (match, key: string) =>
    Object.hasOwn(vars, key) ? vars[key] : match);
}

export function templateVars(
  order: OnlineOrderView,
  groups: BranchGroup[],
  now: Date,
): Record<string, string> {
  void now;
  const branchNames = groups.map((group) => group.branchName);
  const count = groups.length;
  const lines = groups.flatMap((group) => group.items.map((item) =>
    `• ${item.quantity} × ${item.productName} (${item.variantLabel}) — ${fmtUSD(item.unitPrice)}`));

  return {
    nombre: order.customerName.trim().split(/\s+/)[0] ?? "",
    numero: order.number,
    lineas: lines.join("\n"),
    total: fmtUSD(order.total),
    sucursales: `Sale de: ${branchNames.join(", ")}${count > 1 ? ` · serán ${count} facturas y ${count} envíos` : ""}`,
    vence: order.expiresAt ? caracasDateTime.format(new Date(order.expiresAt)) : "—",
    motivo: order.closeReason ? ` Motivo: ${order.closeReason}.` : "",
  };
}

export function buildWhatsAppUrl(phoneE164: string, text: string): string | null {
  if (!/^\+[1-9][0-9]{7,14}$/.test(phoneE164)) return null;
  return `https://wa.me/${phoneE164.slice(1)}?text=${encodeURIComponent(text)}`;
}
