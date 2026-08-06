import type { ProjectPaymentMethod } from "@/lib/database.types";

export const CONFERENCE_MAX_TICKETS = 10;
export const CONFERENCE_MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export const CONFERENCE_ALLOWED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ConferenceAttendeeInput = {
  nombre?: unknown;
  apellido?: unknown;
  documento?: unknown;
  email?: unknown;
  telefono?: unknown;
  institucion?: unknown;
  perfil?: unknown;
};

export type ConferenceRegistrationInput = {
  cantidad?: unknown;
  metodoPago?: unknown;
  referencia?: unknown;
  asistentes?: unknown;
};

export type CleanConferenceAttendee = {
  firstName: string;
  lastName: string;
  document: string;
  email: string;
  phone: string;
  institution: string | null;
  profile: string;
};

export type CleanConferenceRegistration = {
  quantity: number;
  paymentMethod: ProjectPaymentMethod;
  reference: string | null;
  attendees: CleanConferenceAttendee[];
};

function text(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

export function conferenceOrderCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `CIM10-${code}`;
}

export function normalizeConferencePaymentMethod(value: unknown): ProjectPaymentMethod {
  const raw = text(value, 80).toLowerCase();
  if (raw === "pago móvil" || raw === "pago movil") return "Pago móvil";
  if (raw === "divisa $" || raw === "efectivo usd" || raw === "efectivo") return "Efectivo USD";
  if (raw === "zelle / zinli" || raw === "zelle/zinli" || raw === "zelle" || raw === "zinli") {
    return "Zelle/Zinli";
  }
  if (raw === "binance") return "Binance";
  if (raw === "cashea") return "Cashea";
  throw new Error("Selecciona un método de pago válido.");
}

export function conferenceMethodRequiresReceipt(method: ProjectPaymentMethod) {
  return method !== "Efectivo USD";
}

export function conferenceCurrency(method: ProjectPaymentMethod): "USD" | "VES" {
  return method === "Pago móvil" ? "VES" : "USD";
}

export function conferenceAmount({
  method,
  unitUsd,
  bcvRate,
}: {
  method: ProjectPaymentMethod;
  unitUsd: number;
  bcvRate: number;
}) {
  if (method === "Pago móvil") return round2(unitUsd * bcvRate);
  return round2(unitUsd);
}

export function conferenceReference({
  method,
  reference,
  orderCode,
  quantity,
  index,
}: {
  method: ProjectPaymentMethod;
  reference: string | null;
  orderCode: string;
  quantity: number;
  index: number;
}) {
  if (!conferenceMethodRequiresReceipt(method)) return null;
  if (!reference) return null;
  if (quantity === 1) return reference;
  return `${reference}-${orderCode.slice(-6)}-${index + 1}`;
}

export function validateConferenceRegistration(
  input: ConferenceRegistrationInput,
): CleanConferenceRegistration {
  const quantity = Number(input.cantidad);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > CONFERENCE_MAX_TICKETS) {
    throw new Error(`La cantidad debe estar entre 1 y ${CONFERENCE_MAX_TICKETS}.`);
  }

  const paymentMethod = normalizeConferencePaymentMethod(input.metodoPago);
  const reference = text(input.referencia, 120) || null;
  if (conferenceMethodRequiresReceipt(paymentMethod) && !reference) {
    throw new Error("La referencia es obligatoria para este método de pago.");
  }

  if (!Array.isArray(input.asistentes) || input.asistentes.length !== quantity) {
    throw new Error("La cantidad de asistentes no coincide con la compra.");
  }

  return {
    quantity,
    paymentMethod,
    reference,
    attendees: input.asistentes.map(validateConferenceAttendee),
  };
}

export function validateConferenceAttendee(
  attendee: ConferenceAttendeeInput,
): CleanConferenceAttendee {
  const clean = {
    firstName: text(attendee.nombre, 80),
    lastName: text(attendee.apellido, 80),
    document: text(attendee.documento, 40),
    email: text(attendee.email, 160).toLowerCase(),
    phone: text(attendee.telefono, 40),
    institution: text(attendee.institucion, 120) || null,
    profile: text(attendee.perfil, 80),
  };

  if (!clean.firstName || !clean.lastName || !clean.document || !clean.phone || !clean.profile) {
    throw new Error("Completa todos los datos obligatorios del asistente.");
  }
  if (!EMAIL.test(clean.email)) throw new Error("Introduce un correo válido.");

  return clean;
}

export function validateConferenceReceipt(file: File | null, requiresReceipt: boolean) {
  if (requiresReceipt && !file) throw new Error("Adjunta el comprobante de tu pago.");
  if (!file) return;
  if (file.size > CONFERENCE_MAX_RECEIPT_BYTES) {
    throw new Error("El comprobante no debe superar los 5 MB.");
  }
  if (file.type && !CONFERENCE_ALLOWED_RECEIPT_TYPES.has(file.type)) {
    throw new Error("El comprobante debe ser una imagen JPG, PNG, WebP o un PDF.");
  }
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
