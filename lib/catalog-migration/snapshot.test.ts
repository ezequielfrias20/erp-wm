import { describe, expect, it } from "vitest";
import { parseSnapshot } from "./snapshot";

describe("parseSnapshot", () => {
  it("acepta una foto válida y convierte price/cost/stock/sale_lines a número", () => {
    const s = parseSnapshot({
      taken_at: "2026-11-11T12:00:00Z",
      branches: [],
      categories: [],
      brands: [],
      colors: [],
      products: [],
      variants: [
        {
          id: "v1",
          product_id: "p1",
          sku: "A",
          color: null,
          color_hex: null,
          size: null,
          price: "35.00",
          cost: "10",
          is_active: true,
          stock: { b1: "2" },
          sale_lines: "3",
          created_at: "x",
          updated_at: "x",
        },
      ],
    });
    expect(s.variants[0].price).toBe(35);
    expect(s.variants[0].cost).toBe(10);
    expect(s.variants[0].stock).toEqual({ b1: 2 });
    expect(s.variants[0].sale_lines).toBe(3);
  });

  it("falla con mensaje claro si falta una sección", () => {
    expect(() => parseSnapshot({ taken_at: "x", branches: [] })).toThrow(/categories/);
  });

  it("falla si no es un objeto", () => {
    expect(() => parseSnapshot(null)).toThrow(/foto/i);
  });
});
