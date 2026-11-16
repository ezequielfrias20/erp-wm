import { describe, expect, it } from "vitest";
import { resolveMasterField } from "./classification";

const valid = (id: string) => id === "activa";

describe("resolveMasterField", () => {
  it("valor sin cambios que ya no está en los maestros (inactivo o departamento) → no se toca", () => {
    expect(resolveMasterField("inactiva", "inactiva", valid)).toEqual({ ok: true, write: false });
  });
  it("cambio a un maestro válido → se escribe", () => {
    expect(resolveMasterField("activa", "inactiva", valid)).toEqual({ ok: true, write: true, value: "activa" });
  });
  it("cambio a un id que no es maestro válido → error", () => {
    expect(resolveMasterField("otra", "inactiva", valid)).toEqual({ ok: false });
  });
  it("vaciar el campo → se escribe null", () => {
    expect(resolveMasterField(null, "activa", valid)).toEqual({ ok: true, write: true, value: null });
  });
  it("vacío y ya estaba vacío → no se toca", () => {
    expect(resolveMasterField(null, null, valid)).toEqual({ ok: true, write: false });
  });
});
