import { describe, expect, it } from "vitest";
import { productReadiness, type ReadinessInput } from "./readiness";

const complete = (): ReadinessInput => ({
  isActive: true,
  description: "Descripción del producto",
  brandId: "marca-1",
  category: { id: "categoria-1", parentId: "departamento-1", requiresColor: false, optionTypeId: null },
  requiredAttributeIds: [],
  attributeIdsWithValue: [],
  variants: [{ id: "v1", sku: "SKU-1", isActive: true, price: 10, colorId: "rojo", optionValueId: null, optionTypeId: null }],
  media: [{ colorId: "rojo" }],
});

describe("productReadiness", () => {
  it("producto inactivo queda listo sin faltantes", () => {
    const input: ReadinessInput = { ...complete(), isActive: false, description: null, category: null, media: [] };
    expect(productReadiness(input)).toEqual({ ready: true, missing: [] });
  });

  it("sin categoría pide categoría", () => {
    expect(productReadiness({ ...complete(), category: null }).missing).toContainEqual({ kind: "category" });
  });

  it("categoría de primer nivel pide categoría", () => {
    const input = complete();
    expect(productReadiness({ ...input, category: { ...input.category!, parentId: null } }).missing)
      .toContainEqual({ kind: "category" });
  });

  it("sin marca pide marca", () => {
    expect(productReadiness({ ...complete(), brandId: null }).missing).toContainEqual({ kind: "brand" });
  });

  it("descripción vacía o sólo espacios pide descripción", () => {
    for (const description of ["", "  \t "]) {
      expect(productReadiness({ ...complete(), description }).missing).toContainEqual({ kind: "description" });
    }
  });

  it("atributo obligatorio sin valor pide ese atributo", () => {
    expect(productReadiness({ ...complete(), requiredAttributeIds: ["tela", "corte"], attributeIdsWithValue: ["tela"] }).missing)
      .toContainEqual({ kind: "attribute", attributeId: "corte" });
  });

  it("dos colores activos con foto de uno piden foto del otro", () => {
    const input = complete();
    input.variants.push({ id: "v2", sku: "SKU-2", isActive: true, price: 10, colorId: "azul", optionValueId: null, optionTypeId: null });
    expect(productReadiness(input)).toEqual({ ready: false, missing: [{ kind: "photo", colorId: "azul" }] });
  });

  it("un solo color acepta una foto General", () => {
    expect(productReadiness({ ...complete(), media: [{ colorId: null }] })).toEqual({ ready: true, missing: [] });
  });

  it("variantes sin color y sin fotos piden foto con colorId null", () => {
    const input = complete();
    input.variants[0].colorId = null;
    input.media = [];
    expect(productReadiness(input).missing).toContainEqual({ kind: "photo", colorId: null });
  });

  it("variante activa con precio cero pide precio", () => {
    const input = complete();
    input.variants[0].price = 0;
    expect(productReadiness(input).missing).toContainEqual({ kind: "price", sku: "SKU-1" });
  });

  it("categoría que exige color marca variante sin color", () => {
    const input = complete();
    input.category = { ...input.category!, requiresColor: true };
    input.variants[0].colorId = null;
    expect(productReadiness(input).missing).toContainEqual({ kind: "variantColor", sku: "SKU-1" });
  });

  it("opción de otro tipo marca variantOption", () => {
    const input = complete();
    input.category = { ...input.category!, optionTypeId: "talla" };
    input.variants[0].optionValueId = "amarre-1";
    input.variants[0].optionTypeId = "amarre";
    expect(productReadiness(input).missing).toContainEqual({ kind: "variantOption", sku: "SKU-1" });
  });

  it("opción ausente cuando la categoría tiene tipo marca variantOption", () => {
    const input = complete();
    input.category = { ...input.category!, optionTypeId: "talla" };
    expect(productReadiness(input).missing).toContainEqual({ kind: "variantOption", sku: "SKU-1" });
  });

  it("línea ausente no afecta la completitud", () => {
    expect(productReadiness(complete())).toEqual({ ready: true, missing: [] });
  });

  it("variante inactiva no cuenta para fotos ni precio", () => {
    const input = complete();
    input.variants.push({ id: "v2", sku: "SKU-2", isActive: false, price: 0, colorId: "azul", optionValueId: null, optionTypeId: null });
    expect(productReadiness(input)).toEqual({ ready: true, missing: [] });
  });
});
