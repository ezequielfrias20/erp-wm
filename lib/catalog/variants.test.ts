import { describe, expect, it } from "vitest";
import { findDuplicate, legacyText, missingCombinations, variantDeleteBlockers, variantKey } from "./variants";

describe("variantKey", () => {
  it("distingue null de un identificador literal y separa los ejes", () => {
    expect(variantKey(null, "talla")).not.toBe(variantKey("null", "talla"));
    expect(variantKey("a", "b")).not.toBe(variantKey("b", "a"));
  });
});

describe("findDuplicate", () => {
  it("encuentra la misma combinación con opción null", () => {
    const existing = [{ id: "v1", colorId: "rojo", optionValueId: null }];
    expect(findDuplicate(existing, { colorId: "rojo", optionValueId: null })).toBe(existing[0]);
  });

  it("no considera duplicada la misma variante", () => {
    const existing = [{ id: "v1", colorId: "rojo", optionValueId: null }];
    expect(findDuplicate(existing, { id: "v1", colorId: "rojo", optionValueId: null })).toBeNull();
  });
});

describe("missingCombinations", () => {
  it("devuelve cinco de seis combinaciones en orden color y talla", () => {
    expect(missingCombinations(
      [{ colorId: "rojo", optionValueId: "M" }],
      ["rojo", "azul"],
      ["S", "M", "L"],
    )).toEqual([
      { colorId: "rojo", optionValueId: "S" },
      { colorId: "rojo", optionValueId: "L" },
      { colorId: "azul", optionValueId: "S" },
      { colorId: "azul", optionValueId: "M" },
      { colorId: "azul", optionValueId: "L" },
    ]);
  });
});

describe("legacyText", () => {
  it("sin color ni opción devuelve todos los textos null", () => {
    expect(legacyText(null, null)).toEqual({ color: null, color_hex: null, size: null });
  });

  it("con color y opción devuelve nombre, hex y etiqueta", () => {
    expect(legacyText({ name: "Rojo", hex: "#ff0000" }, { label: "M" }))
      .toEqual({ color: "Rojo", color_hex: "#ff0000", size: "M" });
  });
});

describe("variantDeleteBlockers", () => {
  it("sin referencias ni stock no bloquea", () => {
    expect(variantDeleteBlockers({ saleLines: 0, purchaseLines: 0, stock: 0, aliases: 0 })).toEqual([]);
  });

  it("stock y alias bloquean en ese orden", () => {
    expect(variantDeleteBlockers({ saleLines: 0, purchaseLines: 0, stock: 1, aliases: 1 }))
      .toEqual(["stock", "aliases"]);
  });
});
