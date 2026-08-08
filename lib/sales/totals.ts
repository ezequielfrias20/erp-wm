export const DEFAULT_TAX_RATE = 0.16;

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function roundCalc(value: number): number {
  return roundTo(value, 4);
}

export function roundMoney(value: number): number {
  return roundTo(value, 2);
}

export type TaxIncludedTotalsInput = {
  grossSubtotal: number;
  discountPct?: number;
  discountAmount?: number;
  taxRate?: number;
};

export type TaxIncludedTotals = {
  subtotal: number;
  discount: number;
  taxableBase: number;
  tax: number;
  total: number;
};

export function calculateTaxIncludedTotals({
  grossSubtotal,
  discountPct = 0,
  discountAmount,
  taxRate = DEFAULT_TAX_RATE,
}: TaxIncludedTotalsInput): TaxIncludedTotals {
  const subtotal = roundMoney(Math.max(0, grossSubtotal));
  const rawDiscount =
    discountAmount == null
      ? roundCalc((subtotal * Math.min(Math.max(discountPct, 0), 100)) / 100)
      : discountAmount;
  const discount = roundMoney(Math.min(Math.max(rawDiscount, 0), subtotal));
  const total = roundMoney(Math.max(0, roundCalc(subtotal - discount)));
  const taxableBase = roundMoney(total / (1 + taxRate));
  const tax = roundMoney(total - taxableBase);

  return {
    subtotal,
    discount,
    taxableBase,
    tax,
    total,
  };
}

export function usdToVesAmount(usd: number, rate: number): number {
  return roundMoney(roundCalc(usd) * roundCalc(rate || 0));
}
