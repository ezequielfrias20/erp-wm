import { describe, expect, it } from "vitest";
import { chunk } from "./chunk";

describe("chunk", () => {
  it("parte en grupos del tamaño pedido y deja el resto al final", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("lista vacía → ningún grupo", () => {
    expect(chunk([], 100)).toEqual([]);
  });
  it("tamaño inválido es error", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});
