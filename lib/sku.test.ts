import { describe, expect, it } from "vitest";
import { nextSeqFromSkusAndAliases } from "./sku";

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
