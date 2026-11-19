import { describe, expect, it } from "vitest";
import { validateOnlineSettings } from "./settings";

const valid = {
  softHoldMinutes: 30,
  firmHoldHours: 24,
  storeWhatsapp: "+584141234567",
  templates: { aceptada: "Hola {nombre}" },
};

describe("validateOnlineSettings", () => {
  it("rechaza un apartado corto fuera del rango", () => {
    expect(validateOnlineSettings({ ...valid, softHoldMinutes: 4 }))
      .toBe("El apartado corto debe estar entre 5 y 240 minutos");
  });

  it("rechaza un apartado firme fuera del rango", () => {
    expect(validateOnlineSettings({ ...valid, firmHoldHours: 169 }))
      .toBe("El apartado firme debe estar entre 1 y 168 horas");
  });

  it("rechaza un WhatsApp sin formato internacional", () => {
    expect(validateOnlineSettings({ ...valid, storeWhatsapp: "04141234567" }))
      .toBe("El WhatsApp de la tienda debe ir en formato +58…");
  });

  it("acepta valores válidos, incluido un WhatsApp vacío", () => {
    expect(validateOnlineSettings(valid)).toBeNull();
    expect(validateOnlineSettings({ ...valid, storeWhatsapp: "" })).toBeNull();
  });

  it("exige números enteros y plantillas de hasta 1000 caracteres", () => {
    expect(validateOnlineSettings({ ...valid, softHoldMinutes: 5.5 })).not.toBeNull();
    expect(validateOnlineSettings({ ...valid, templates: { aceptada: "a".repeat(1001) } })).not.toBeNull();
    expect(validateOnlineSettings({ ...valid, templates: { aceptada: "a".repeat(1000) } })).toBeNull();
  });
});
