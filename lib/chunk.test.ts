import { describe, expect, it } from "vitest";
import { chunk, inChunks } from "./chunk";

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

describe("inChunks", () => {
  it("consulta por grupos de 100 como máximo y junta los resultados en orden", async () => {
    const ids = Array.from({ length: 234 }, (_, i) => `v${i}`);
    const sizes: number[] = [];
    const rows = await inChunks(ids, async (part) => {
      sizes.push(part.length);
      return part.map((id) => ({ id }));
    });
    expect(sizes).toEqual([100, 100, 34]);
    expect(rows.map((row) => row.id)).toEqual(ids);
  });
  it("sin ids no consulta", async () => {
    let calls = 0;
    expect(await inChunks([], async () => { calls++; return [1]; })).toEqual([]);
    expect(calls).toBe(0);
  });
});
