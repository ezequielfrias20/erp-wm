import { describe, expect, it } from "vitest";
import { resolveImportSkus, resolveSku } from "./sku-alias";

const real = new Map([["GOR-GORTIR-0001", "v1"]]);
const aliases = new Map([["GOR-GORTIR-0002", "v1"]]);

describe("resolveSku", () => {
  it("resuelve el SKU viejo sin distinguir mayúsculas ni espacios externos", () => {
    expect(resolveSku("gor-gortir-0002 ", real, aliases)).toBe("v1");
  });

  it("resuelve el SKU real", () => {
    expect(resolveSku(" gor-gortir-0001 ", real, aliases)).toBe("v1");
  });

  it("devuelve null para SKU desconocido", () => {
    expect(resolveSku("desconocido", real, aliases)).toBeNull();
  });
});

describe("resolveImportSkus", () => {
  it("rechaza ambas filas cuando alias y SKU real se refieren a la misma variante en una sucursal", () => {
    expect(resolveImportSkus([
      { row: 2, sku: "gor-gortir-0002 ", branch: "centro" },
      { row: 3, sku: "GOR-GORTIR-0001", branch: "centro" },
    ], real, aliases)).toEqual({ resolved: [], conflicts: [{ rows: [2, 3], variantId: "v1", reason: "alias" }], unknown: [] });
  });

  it("marca como duplicado el mismo SKU aunque cambien mayúsculas y espacios", () => {
    expect(resolveImportSkus([
      { row: 2, sku: " gor-gortir-0001 ", branch: "centro" },
      { row: 3, sku: "GOR-GORTIR-0001", branch: "centro" },
    ], real, aliases)).toEqual({ resolved: [], conflicts: [{ rows: [2, 3], variantId: "v1", reason: "duplicate" }], unknown: [] });
  });

  it("marca como alias un grupo mixto de SKU repetido y SKU anterior", () => {
    expect(resolveImportSkus([
      { row: 2, sku: "GOR-GORTIR-0001", branch: "centro" },
      { row: 3, sku: "gor-gortir-0001 ", branch: "centro" },
      { row: 4, sku: "GOR-GORTIR-0002", branch: "centro" },
    ], real, aliases)).toEqual({ resolved: [], conflicts: [{ rows: [2, 3, 4], variantId: "v1", reason: "alias" }], unknown: [] });
  });

  it("resuelve alias y SKU real en sucursales diferentes", () => {
    expect(resolveImportSkus([
      { row: 2, sku: "GOR-GORTIR-0002", branch: "centro" },
      { row: 3, sku: "gor-gortir-0001", branch: "norte" },
    ], real, aliases)).toEqual({
      resolved: [{ row: 2, variantId: "v1" }, { row: 3, variantId: "v1" }],
      conflicts: [], unknown: [],
    });
  });

  it("la misma sucursal escrita distinto (mayúsculas, espacios) también es conflicto", () => {
    expect(resolveImportSkus([
      { row: 4, sku: "GOR-GORTIR-0002", branch: "Maracay" },
      { row: 5, sku: "GOR-GORTIR-0001", branch: " maracay " },
    ], real, aliases)).toEqual({ resolved: [], conflicts: [{ rows: [4, 5], variantId: "v1", reason: "alias" }], unknown: [] });
  });

  it("separa filas con SKU desconocido", () => {
    expect(resolveImportSkus([{ row: 8, sku: "NO-EXISTE", branch: "centro" }], real, aliases))
      .toEqual({ resolved: [], conflicts: [], unknown: [8] });
  });
});
