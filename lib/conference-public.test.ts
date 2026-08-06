import { describe, expect, it } from "vitest";
import {
  conferenceAmount,
  conferenceCurrency,
  conferenceReference,
  normalizeConferencePaymentMethod,
  validateConferenceRegistration,
} from "./conference-public";

const attendee = {
  nombre: "Ana",
  apellido: "Perez",
  documento: "V-123",
  email: "ANA@EXAMPLE.COM",
  telefono: "0412",
};

describe("conference public registration helpers", () => {
  it("normalizes landing payment methods to ERP values", () => {
    expect(normalizeConferencePaymentMethod("Pago Móvil")).toBe("Pago móvil");
    expect(normalizeConferencePaymentMethod("Divisa $")).toBe("Efectivo USD");
    expect(normalizeConferencePaymentMethod("Zelle / Zinli")).toBe("Zelle/Zinli");
  });

  it("validates and cleans a conference registration", () => {
    const clean = validateConferenceRegistration({
      cantidad: "1",
      metodoPago: "Pago Móvil",
      referencia: " 123 ",
      asistentes: [attendee],
    });

    expect(clean.quantity).toBe(1);
    expect(clean.paymentMethod).toBe("Pago móvil");
    expect(clean.attendees[0]?.email).toBe("ana@example.com");
  });

  it("allows at most two tickets per checkout", () => {
    expect(() => validateConferenceRegistration({
      cantidad: "3",
      metodoPago: "Pago Móvil",
      referencia: "123",
      asistentes: [
        attendee,
        { ...attendee, documento: "V-124", email: "ana2@example.com" },
        { ...attendee, documento: "V-125", email: "ana3@example.com" },
      ],
    })).toThrow(/entre 1 y 2/i);
  });

  it("rejects repeated document or email in the same checkout", () => {
    expect(() => validateConferenceRegistration({
      cantidad: "2",
      metodoPago: "Pago Móvil",
      referencia: "123",
      asistentes: [attendee, { ...attendee, email: "otro@example.com" }],
    })).toThrow(/documento/i);

    expect(() => validateConferenceRegistration({
      cantidad: "2",
      metodoPago: "Pago Móvil",
      referencia: "124",
      asistentes: [attendee, { ...attendee, documento: "V-124" }],
    })).toThrow(/correo/i);
  });

  it("calculates currency and amount for VES and USD methods", () => {
    expect(conferenceCurrency("Pago móvil")).toBe("VES");
    expect(conferenceAmount({ method: "Pago móvil", unitUsd: 39, bcvRate: 120 })).toBe(4680);
    expect(conferenceAmount({ method: "Binance", unitUsd: 39, bcvRate: 120 })).toBe(39);
  });

  it("keeps payment references unique inside multi-ticket purchases", () => {
    expect(conferenceReference({
      method: "Binance",
      reference: "ABC",
      orderCode: "CIM10-XYZ789",
      quantity: 2,
      index: 1,
    })).toBe("ABC-XYZ789-2");
  });
});
