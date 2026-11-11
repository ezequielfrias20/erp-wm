import { describe, expect, it } from "vitest";
import {
  classifySize,
  extractFromName,
  matchColor,
  matchOption,
  normalizeKey,
  stripBranchPriceSuffix,
  titleCase,
} from "./parse";
import { TAXONOMY } from "./taxonomy";

const T = TAXONOMY;

describe("normalizeKey", () => {
  it("normaliza mayúsculas, espacios, acentos, ñ y asteriscos", () => {
    expect(normalizeKey("  Mao  Stretch DAMA ")).toBe("mao stretch dama");
    expect(normalizeKey("Naranja *")).toBe("naranja");
    expect(normalizeKey("Moño")).toBe("mono");
    expect(normalizeKey("Algodón")).toBe("algodon");
  });
});

describe("titleCase", () => {
  it("solo toca palabras en minúscula y deja conectores", () => {
    expect(titleCase("basico stretch caballero recta")).toBe("Basico Stretch Caballero Recta");
    expect(titleCase("set de Kit de sutura")).toBe("Set de Kit de Sutura");
    expect(titleCase("Tensiometro GMD Digital Con Voz")).toBe("Tensiometro GMD Digital Con Voz");
    expect(titleCase("estetoscopio OIS 300")).toBe("Estetoscopio OIS 300");
  });
});

describe("stripBranchPriceSuffix", () => {
  it("quita « · sucursal · $precio»", () => {
    expect(stripBranchPriceSuffix("XS · San Juan de los Morros · $35")).toBe("XS");
    expect(stripBranchPriceSuffix("Moño · Maracay · $10")).toBe("Moño");
    expect(stripBranchPriceSuffix("M")).toBe("M");
  });
});

describe("matchOption / matchColor", () => {
  it("reconoce opciones por etiqueta o alias", () => {
    expect(matchOption("S-m", T)).toEqual({ type: "talla", label: "S-M" });
    expect(matchOption("Elastica", T)).toEqual({ type: "amarre", label: "Elástica" });
    expect(matchOption("mono", T)).toEqual({ type: "amarre", label: "Moño" });
  });

  it("reconoce colores por nombre o alias, sin importar mayúsculas, acentos ni «*»", () => {
    expect(matchColor("mostaza", T)).toBe("Mostaza");
    expect(matchColor("Verde Qx", T)).toBe("Verde Quirófano");
    expect(matchColor("Naranja *", T)).toBe("Naranja");
    expect(matchColor("Colors", T)).toBeNull();
  });
});

describe("classifySize", () => {
  it("talla con sufijo de sucursal y precio", () => {
    expect(classifySize("XS · San Juan de los Morros · $35", "Mao Mic Dama Recta", T)).toEqual([
      { kind: "option", option: { type: "talla", label: "XS" } },
    ]);
  });

  it("talla compuesta con color estampado", () => {
    expect(
      classifySize("S-m / Batido Amarrillo", "Medias Compresivas 15-20 Mmhg S-m Batido Amarrillo", T),
    ).toEqual([
      { kind: "option", option: { type: "talla", label: "S-M" } },
      { kind: "color", color: "Batido Amarillo" },
    ]);
  });

  it("partes que ya están en el nombre son redundantes", () => {
    expect(classifySize("Latidos GMD / Sin Voz", "Tensiometro Digital Latidos GMD Sin Voz", T)).toEqual([
      { kind: "redundant", text: "Latidos GMD" },
      { kind: "redundant", text: "Sin Voz" },
    ]);
    expect(classifySize("Bob Sponja", "Rompe Ampollas 3D Bob Sponja", T)).toEqual([
      { kind: "redundant", text: "Bob Sponja" },
    ]);
  });

  it("un color escrito en la talla", () => {
    expect(classifySize("Morada", "Tijeras Trauma GMD Tornasol Morada", T)).toEqual([
      { kind: "color", color: "Morado" },
    ]);
  });

  it("lo que no reconoce queda como desconocido", () => {
    expect(classifySize("Foo", "Bar", T)).toEqual([{ kind: "unknown", text: "Foo" }]);
  });
});

describe("extractFromName", () => {
  it("saca el amarre del final", () => {
    expect(extractFromName("Gorro Baby Yoda Moño", T)).toEqual({
      baseName: "Gorro Baby Yoda",
      color: null,
      option: { type: "amarre", label: "Moño" },
    });
  });

  it("saca amarre y color, y capitaliza", () => {
    expect(extractFromName("gorro anestesia azul tiras", T)).toEqual({
      baseName: "Gorro Anestesia",
      color: "Azul",
      option: { type: "amarre", label: "Tiras" },
    });
    expect(extractFromName("Gorro Hello Kitty Rojo Moño", T)).toEqual({
      baseName: "Gorro Hello Kitty",
      color: "Rojo",
      option: { type: "amarre", label: "Moño" },
    });
  });

  it("color de varias palabras y talla", () => {
    expect(extractFromName("Medias Compresivas 15-20 Mmhg S-m Batido Amarrillo", T)).toEqual({
      baseName: "Medias Compresivas 15-20 Mmhg",
      color: "Batido Amarillo",
      option: { type: "talla", label: "S-M" },
    });
    expect(extractFromName("Tijeras Trauma GMD Tornasol Negra", T).color).toBe("Negro");
  });

  it("no deja nombres de una sola palabra", () => {
    expect(extractFromName("Gorro Rojo", T)).toEqual({ baseName: "Gorro Rojo", color: null, option: null });
    expect(extractFromName("Gorro Cafe Elastica", T)).toEqual({
      baseName: "Gorro Cafe",
      color: null,
      option: { type: "amarre", label: "Elástica" },
    });
  });

  it("deja igual un nombre sin color ni opción", () => {
    expect(extractFromName("Mao Stretch Dama Recta", T)).toEqual({
      baseName: "Mao Stretch Dama Recta",
      color: null,
      option: null,
    });
  });
});
