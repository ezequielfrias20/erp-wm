import { describe, expect, it } from "vitest";
import { sellableStock } from "./stock";

describe("sellableStock", () => {
  it("sin apartados devuelve la existencia", () => expect(sellableStock(3, 0)).toBe(3));
  it("resta lo apartado", () => expect(sellableStock(3, 2)).toBe(1));
  it("nunca es negativo", () => expect(sellableStock(1, 2)).toBe(0));
});
