import { describe, expect, it } from "vitest";
import { resolveBcvRate } from "./bcv";

describe("resolveBcvRate", () => {
  it("uses the historical rate when its date is newer", () => {
    expect(
      resolveBcvRate(
        {
          promedio: 756.7083,
          fechaActualizacion: "2026-08-07T00:00:00-04:00",
        },
        [
          {
            fuente: "oficial",
            promedio: 757.5406,
            fecha: "2026-08-10",
          },
        ],
      ),
    ).toEqual({
      rate: 757.5406,
      updatedAt: "2026-08-10T00:00:00-04:00",
      source: "BCV (histórico)",
    });
  });

  it("uses the current rate when its date is newer", () => {
    expect(
      resolveBcvRate(
        {
          promedio: 760,
          fechaActualizacion: "2026-08-11T00:00:00-04:00",
        },
        [
          {
            fuente: "oficial",
            promedio: 759,
            fecha: "2026-08-10",
          },
        ],
      ).rate,
    ).toBe(760);
  });

  it("uses the highest amount when both feeds have the same date", () => {
    expect(
      resolveBcvRate(
        {
          promedio: 756.7083,
          fechaActualizacion: "2026-08-10T00:00:00-04:00",
        },
        [
          {
            fuente: "oficial",
            promedio: 757.5406,
            fecha: "2026-08-10",
          },
        ],
      ).rate,
    ).toBe(757.5406);
  });

  it("falls back to the available feed when only one endpoint returns valid data", () => {
    expect(
      resolveBcvRate(null, [
        {
          fuente: "oficial",
          promedio: 757.5406,
          fecha: "2026-08-10",
        },
      ]).rate,
    ).toBe(757.5406);
  });

  it("throws when neither endpoint has a valid rate", () => {
    expect(() => resolveBcvRate(null, [])).toThrow("No hay tasa válida");
  });
});
