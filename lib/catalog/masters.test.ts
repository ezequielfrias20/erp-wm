import { describe, expect, it } from "vitest";
import {
  categoryPlacementError,
  departmentDeactivationError,
  inUseMessage,
  normalizeHex,
  sameName,
  uniqueSlug,
} from "./masters";

describe("normalizeHex", () => {
  it.each([
    ["#0ea5e9", "#0EA5E9"],
    ["abc", "#AABBCC"],
    ["#12345", null],
    ["zzz", null],
  ])("normaliza %s", (input, expected) => {
    expect(normalizeHex(input)).toBe(expected);
  });
});

describe("uniqueSlug", () => {
  it("agrega un sufijo libre", () => {
    expect(uniqueSlug("Azul Marino", ["azul-marino", "azul-marino-2"])).toBe("azul-marino-3");
  });
});

describe("sameName", () => {
  it("ignora espacios, mayúsculas y acentos", () => {
    expect(sameName("azul marino ", "Azul Marino")).toBe(true);
    expect(sameName("Algodón", "algodon")).toBe(true);
  });
});

describe("inUseMessage", () => {
  it("informa usos y opción de desactivar", () => {
    expect(inUseMessage(0, "variantes", true)).toBeNull();
    expect(inUseMessage(3, "variantes", true)).toBe("En uso por 3 variantes. Desactívalo en su lugar.");
    expect(inUseMessage(2, "categorías", false)).toBe("En uso por 2 categorías.");
  });
});

describe("categoryPlacementError", () => {
  it("impide un tercer nivel y mover un departamento con hijas", () => {
    expect(categoryPlacementError({ parentId: "x", parentIsDepartment: false, hasChildren: false })).toBeTruthy();
    expect(categoryPlacementError({ parentId: "x", parentIsDepartment: true, hasChildren: true })).toBeTruthy();
    expect(categoryPlacementError({ parentId: "x", parentIsDepartment: true, hasChildren: false })).toBeNull();
    expect(categoryPlacementError({ parentId: null, parentIsDepartment: false, hasChildren: false })).toBeNull();
  });
});

describe("departmentDeactivationError", () => {
  it("bloquea departamentos con categorías activas", () => {
    expect(departmentDeactivationError(2)).toBeTruthy();
    expect(departmentDeactivationError(0)).toBeNull();
  });
});
