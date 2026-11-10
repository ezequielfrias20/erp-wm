import { describe, expect, it } from "vitest";
import type { DailyClosureLine } from "./database.types";
import { closureGroupOf, groupClosureRows } from "./closure-groups";

const line = (
  source: DailyClosureLine["source"], method: string, currency: "USD" | "VES",
  expected: number, counted?: number,
): DailyClosureLine => ({ source, method, currency, expected, expected_usd: 0, counted });

describe("closure groups", () => {
  it("keeps Cashea Online and the Cashea deposit out of the branch cash totals", () => {
    const groups = groupClosureRows([
      line("sale", "Pago Móvil", "VES", 1000, 1000),
      line("sale", "Efectivo USD", "USD", 50, 48),
      line("legacy", "Histórico · Zelle", "USD", 10, 10),
      line("cashea_online", "Cashea Online · Pago Móvil", "VES", 400, 400),
      line("cashea_online", "Cashea Online · Zelle", "USD", 20, 20),
      line("cashea_settlement", "Depósito Cashea", "USD", 300, 300),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["caja", "cashea_online", "cashea_deposito"]);
    expect(groups[0].totals).toEqual([
      { currency: "USD", expected: 60, counted: 58 },
      { currency: "VES", expected: 1000, counted: 1000 },
    ]);
    expect(groups[1].totals).toEqual([
      { currency: "USD", expected: 20, counted: 20 },
      { currency: "VES", expected: 400, counted: 400 },
    ]);
    expect(groups[2].totals).toEqual([{ currency: "USD", expected: 300, counted: 300 }]);
  });

  it("recognizes the Cashea Online row of closures saved before the new source", () => {
    expect(closureGroupOf({ source: "sale", method: "Cashea Online (Pago móvil)" })).toBe("cashea_online");
    expect(closureGroupOf({ source: "sale", method: "Pago Móvil" })).toBe("caja");
  });

  it("omits empty groups and uses the given counted reader", () => {
    const groups = groupClosureRows([line("sale", "Pago Móvil", "VES", 5)], () => 7);
    expect(groups).toHaveLength(1);
    expect(groups[0].totals).toEqual([{ currency: "VES", expected: 5, counted: 7 }]);
  });
});
