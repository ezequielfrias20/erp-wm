import { describe, expect, it } from "vitest";
import { normalizeKey } from "./parse";

describe("normalizeKey", () => {
  it("normaliza mayúsculas, espacios, acentos, ñ y asteriscos", () => {
    expect(normalizeKey("  Mao  Stretch DAMA ")).toBe("mao stretch dama");
    expect(normalizeKey("Naranja *")).toBe("naranja");
    expect(normalizeKey("Moño")).toBe("mono");
    expect(normalizeKey("Algodón")).toBe("algodon");
  });
});
