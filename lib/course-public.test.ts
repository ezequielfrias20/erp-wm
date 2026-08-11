import { describe, expect, it } from "vitest";
import { validateCourseRegistration } from "./course-public";

describe("course public registration", () => {
  it("requires a valid group and cleans attendee data", () => {
    const result = validateCourseRegistration({
      groupId: "d9428888-122b-4b9e-a67d-3c2f55b83f05",
      cantidad: "1",
      metodoPago: "Pago Movil",
      referencia: "12345",
      asistentes: [{
        nombre: " Ana ",
        apellido: "Perez",
        documento: "V-1",
        email: "ANA@EXAMPLE.COM",
        telefono: "0412",
      }],
    });
    expect(result.groupId).toBe("d9428888-122b-4b9e-a67d-3c2f55b83f05");
    expect(result.attendees[0]?.email).toBe("ana@example.com");
  });

  it("rejects duplicate students in one order", () => {
    const attendee = {
      nombre: "Ana",
      apellido: "Perez",
      documento: "V-1",
      email: "ana@example.com",
      telefono: "0412",
    };
    expect(() => validateCourseRegistration({
      groupId: "d9428888-122b-4b9e-a67d-3c2f55b83f05",
      cantidad: 2,
      metodoPago: "Efectivo USD",
      asistentes: [attendee, attendee],
    })).toThrow(/documento diferente/i);
  });
});
