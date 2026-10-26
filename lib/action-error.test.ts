import { describe, expect, it } from "vitest";

import { ActionTimeoutError, actionErrorMessage } from "./action-error";

describe("actionErrorMessage", () => {
  it("muestra el mensaje del plazo agotado sin envolverlo en el genérico", () => {
    const message = actionErrorMessage(
      new ActionTimeoutError("El servidor no respondió a tiempo. Puedes volver a intentar el cobro."),
      "No se pudo registrar la venta.",
    );
    expect(message).not.toContain("No se pudo registrar la venta.");
    expect(message).toMatch(/no respondió a tiempo/i);
  });

  it("traduce un fallo de transporte a un mensaje accionable", () => {
    const message = actionErrorMessage(new TypeError("Failed to fetch"), "No se pudo guardar.");
    expect(message).toMatch(/conexión/i);
  });

  it("adjunta el detalle al mensaje genérico cuando el error no es reconocible", () => {
    expect(actionErrorMessage(new Error("boom"), "No se pudo guardar.")).toBe(
      "No se pudo guardar. (boom)",
    );
  });

  it("relanza los errores de control de flujo de Next", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;/login" });
    expect(() => actionErrorMessage(redirect, "No se pudo guardar.")).toThrow(redirect);
  });
});
