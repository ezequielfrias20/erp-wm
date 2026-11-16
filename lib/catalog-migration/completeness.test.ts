import { describe, expect, it } from "vitest";
import { buildProposal, type ProposedProduct } from "./propose";
import { attributeRole, isIncomplete, missingFields, missingLabels, variantMissing } from "./completeness";
import { TAXONOMY } from "./taxonomy";
import { MINI_SNAPSHOT } from "./test-fixtures";

const proposal = buildProposal(MINI_SNAPSHOT, TAXONOMY);
const product = (name: string) => {
  const p = proposal.products.find((x) => x.name === name);
  if (!p) throw new Error(`sin producto ${name}`);
  return p;
};

describe("missingFields", () => {
  it("atributos obligatorios vacíos de la categoría", () => {
    expect(missingFields(product("Figs Dama"), TAXONOMY)).toEqual(["attr:corte", "attr:tela"]);
  });

  it("marca vacía", () => {
    expect(missingFields(product("Rompe Ampollas 3D Bob Sponja"), TAXONOMY)).toEqual(["brand"]);
  });

  it("sin categoría: pide categoría (los atributos dependen de ella)", () => {
    const p: ProposedProduct = { ...product("Figs Dama"), categoryPath: null, attributes: {} };
    expect(missingFields(p, TAXONOMY)).toEqual(["category"]);
  });

  it("categoría que no existe en la taxonomía cuenta como sin categoría", () => {
    const p: ProposedProduct = { ...product("Figs Dama"), categoryPath: "Uniformes" };
    expect(missingFields(p, TAXONOMY)).toEqual(["category"]);
  });

  it("producto completo: nada", () => {
    expect(missingFields(product("Mao Mic Dama Recta"), TAXONOMY)).toEqual([]);
  });

  it("etiquetas legibles en el orden de las columnas", () => {
    const p: ProposedProduct = { ...product("Figs Dama"), brand: null };
    expect(missingLabels(p, TAXONOMY)).toEqual(["Marca", "Corte", "Tela"]);
  });
});

describe("isIncomplete", () => {
  it("sólo productos activos con algo faltante", () => {
    expect(isIncomplete(product("Figs Dama"), TAXONOMY)).toBe(true);
    expect(isIncomplete(product("Mao Mic Dama Recta"), TAXONOMY)).toBe(false);
    expect(isIncomplete({ ...product("Figs Dama"), active: false }, TAXONOMY)).toBe(false);
  });
});

describe("attributeRole", () => {
  it("obligatorio, opcional o no aplica según la categoría del producto", () => {
    const gorro = product("Gorro Cafe");
    expect(attributeRole(gorro, "tematica", TAXONOMY)).toBe("required");
    expect(attributeRole(gorro, "genero", TAXONOMY)).toBe("optional");
    expect(attributeRole(gorro, "tela", TAXONOMY)).toBe("n/a");
  });

  it("sin categoría todos los atributos quedan disponibles (opcionales)", () => {
    const p: ProposedProduct = { ...product("Gorro Cafe"), categoryPath: null };
    expect(attributeRole(p, "tela", TAXONOMY)).toBe("optional");
  });
});

describe("variantMissing", () => {
  const variantOf = (productName: string) => {
    const v = proposal.variants.find((x) => x.productName === productName && !x.mergeIntoSku);
    if (!v) throw new Error(`sin variante de ${productName}`);
    return v;
  };

  it("conjunto sin color o sin talla", () => {
    const v = variantOf("Mao Stretch Dama Recta");
    const prod = product("Mao Stretch Dama Recta");
    expect(variantMissing({ ...v, color: null }, prod, TAXONOMY)).toEqual(["color"]);
    expect(variantMissing({ ...v, option: null }, prod, TAXONOMY)).toEqual(["option"]);
    expect(variantMissing(v, prod, TAXONOMY)).toEqual([]);
  });

  it("inactiva, de producto inactivo o que se fusiona: nada", () => {
    const v = { ...variantOf("Mao Stretch Dama Recta"), color: null };
    const prod = product("Mao Stretch Dama Recta");
    expect(variantMissing({ ...v, active: false }, prod, TAXONOMY)).toEqual([]);
    expect(variantMissing(v, { ...prod, active: false }, TAXONOMY)).toEqual([]);
    expect(variantMissing({ ...v, mergeIntoSku: "X" }, prod, TAXONOMY)).toEqual([]);
  });

  it("categoría sin color ni opción: nada", () => {
    const v = variantOf("Tijeras Trauma GMD Tornasol");
    expect(variantMissing({ ...v, color: null, option: null }, product("Tijeras Trauma GMD Tornasol"), TAXONOMY)).toEqual([]);
  });
});
