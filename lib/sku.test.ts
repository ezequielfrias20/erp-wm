import { describe, expect, it } from "vitest";
import { nextSeqFromSkusAndAliases, normalizeSku } from "./sku";

describe("normalizeSku", () => {
  it("quita espacios exteriores y convierte el SKU tecleado a mayúsculas", () => {
    expect(normalizeSku("  gor-gortir-0002  ")).toBe("GOR-GORTIR-0002");
  });

  it("conserva los caracteres interiores y permite un valor vacío", () => {
    expect(normalizeSku(" ab 12 ")).toBe("AB 12");
    expect(normalizeSku("  ")).toBe("");
  });
});

describe("nextSeqFromSkusAndAliases", () => {
  it("reserva los SKU anteriores usados como alias", () => {
    expect(
      nextSeqFromSkusAndAliases(
        "GOR-GORTIR",
        ["GOR-GORTIR-0001"],
        ["GOR-GORTIR-0002"],
      ),
    ).toBe(3);
  });
});
