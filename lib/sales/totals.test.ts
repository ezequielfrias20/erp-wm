import { describe, expect, it } from "vitest";
import { calculateTaxIncludedTotals, usdToVesAmount } from "./totals";

describe("calculateTaxIncludedTotals", () => {
  it("keeps final product prices as the ticket total and extracts IVA", () => {
    expect(calculateTaxIncludedTotals({ grossSubtotal: 5 })).toEqual({
      subtotal: 5,
      discount: 0,
      taxableBase: 4.31,
      tax: 0.69,
      total: 5,
    });
  });

  it("discounts over the final price and extracts IVA from the discounted total", () => {
    expect(
      calculateTaxIncludedTotals({
        grossSubtotal: 10,
        discountPct: 10,
      }),
    ).toEqual({
      subtotal: 10,
      discount: 1,
      taxableBase: 7.76,
      tax: 1.24,
      total: 9,
    });
  });
});

describe("usdToVesAmount", () => {
  it("keeps VES cents when converting the final USD total", () => {
    expect(usdToVesAmount(5, 757.5406)).toBe(3787.7);
  });
});
