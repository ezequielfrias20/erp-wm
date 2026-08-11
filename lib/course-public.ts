import {
  conferenceAmount,
  conferenceCurrency,
  conferenceMethodRequiresReceipt,
  normalizeConferencePaymentMethod,
  validateConferenceReceipt,
  type ConferenceAttendeeInput,
} from "./conference-public";
import type { ProjectPaymentMethod } from "./database.types";

export const COURSE_MAX_STUDENTS_PER_ORDER = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_REFERENCE = /^[A-Za-z0-9._-]{1,120}$/;

export type CleanCourseAttendee = {
  firstName: string;
  lastName: string;
  document: string;
  email: string;
  phone: string;
};

export type CleanCourseRegistration = {
  groupId: string;
  quantity: number;
  paymentMethod: ProjectPaymentMethod;
  reference: string | null;
  attendees: CleanCourseAttendee[];
};

function text(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

export function courseOrderCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `CUR-${code}`;
}

export function validateCourseRegistration(input: {
  groupId?: unknown;
  cantidad?: unknown;
  metodoPago?: unknown;
  referencia?: unknown;
  asistentes?: unknown;
}): CleanCourseRegistration {
  const groupId = text(input.groupId, 40);
  if (!UUID.test(groupId)) throw new Error("Selecciona un horario valido.");

  const quantity = Number(input.cantidad);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > COURSE_MAX_STUDENTS_PER_ORDER) {
    throw new Error(`La cantidad debe estar entre 1 y ${COURSE_MAX_STUDENTS_PER_ORDER}.`);
  }

  const paymentMethod = normalizeConferencePaymentMethod(input.metodoPago);
  const reference = text(input.referencia, 120) || null;
  if (conferenceMethodRequiresReceipt(paymentMethod) && !reference) {
    throw new Error("La referencia es obligatoria para este metodo de pago.");
  }
  if (reference && !PAYMENT_REFERENCE.test(reference)) {
    throw new Error("Introduce una referencia de pago valida.");
  }
  if (!Array.isArray(input.asistentes) || input.asistentes.length !== quantity) {
    throw new Error("La cantidad de estudiantes no coincide con la inscripcion.");
  }

  const attendees = input.asistentes.map(validateCourseAttendee);
  const documents = new Set<string>();
  const emails = new Set<string>();
  for (const attendee of attendees) {
    const document = attendee.document.toLowerCase();
    const email = attendee.email.toLowerCase();
    if (documents.has(document)) throw new Error("Cada estudiante debe usar un documento diferente.");
    if (emails.has(email)) throw new Error("Cada estudiante debe usar un correo diferente.");
    documents.add(document);
    emails.add(email);
  }

  return { groupId, quantity, paymentMethod, reference, attendees };
}

function validateCourseAttendee(input: ConferenceAttendeeInput): CleanCourseAttendee {
  const attendee = {
    firstName: text(input.nombre, 80),
    lastName: text(input.apellido, 80),
    document: text(input.documento, 40),
    email: text(input.email, 160).toLowerCase(),
    phone: text(input.telefono, 40),
  };
  if (!attendee.firstName || !attendee.lastName || !attendee.document || !attendee.phone) {
    throw new Error("Completa todos los datos obligatorios del estudiante.");
  }
  if (!EMAIL.test(attendee.email)) throw new Error("Introduce un correo valido.");
  return attendee;
}

export {
  conferenceAmount as courseAmount,
  conferenceCurrency as courseCurrency,
  conferenceMethodRequiresReceipt as courseMethodRequiresReceipt,
  validateConferenceReceipt as validateCourseReceipt,
};
