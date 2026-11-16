import { describe, expect, it } from "vitest";
import {
  categoryPlacementError,
  departmentDeactivationError,
  attributeLinkChanges,
  categoryActivationError,
  colorDeleteError,
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

describe("colorDeleteError", () => {
  it("bloquea un color sin variantes pero con fotos (si no, sus fotos pasarían a General)", () => {
    expect(colorDeleteError(0, 2)).toBe("En uso por 2 fotos. Desactívalo en su lugar.");
  });
  it("las variantes mandan primero", () => {
    expect(colorDeleteError(3, 2)).toBe("En uso por 3 variantes. Desactívalo en su lugar.");
  });
  it("sin variantes ni fotos se puede borrar", () => {
    expect(colorDeleteError(0, 0)).toBeNull();
  });
});

describe("attributeLinkChanges", () => {
  it("inserta o actualiza las elegidas en orden y quita sólo las que ya no están", () => {
    expect(attributeLinkChanges(["a", "b", "c"], [{ attributeId: "c", required: true }, { attributeId: "d", required: false }])).toEqual({
      upsert: [{ attributeId: "c", required: true, sortOrder: 0 }, { attributeId: "d", required: false, sortOrder: 1 }],
      remove: ["a", "b"],
    });
  });
  it("sin cambios no quita nada", () => {
    expect(attributeLinkChanges(["a"], [{ attributeId: "a", required: false }]).remove).toEqual([]);
  });
});

describe("categoryActivationError", () => {
  it("una categoría activa no puede quedar en un departamento inactivo", () => {
    expect(categoryActivationError({ isActive: true, parentId: "d", parentIsActive: false })).toBe("El departamento está inactivo: actívalo antes o deja la categoría inactiva.");
  });
  it("inactiva en departamento inactivo, o activa en uno activo, o departamento → sin error", () => {
    expect(categoryActivationError({ isActive: false, parentId: "d", parentIsActive: false })).toBeNull();
    expect(categoryActivationError({ isActive: true, parentId: "d", parentIsActive: true })).toBeNull();
    expect(categoryActivationError({ isActive: true, parentId: null, parentIsActive: false })).toBeNull();
  });
});
