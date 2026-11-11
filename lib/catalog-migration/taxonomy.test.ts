import { describe, expect, it } from "vitest";
import { normalizeKey } from "./parse";
import { TAXONOMY, categoryPath, findCategory } from "./taxonomy";

/** Las 52 categorías de producción al 2026-11-11. */
const LEGACY_52 = [
  "Gorros", "Uniformes", "Rompe Ampollas", "Tensiometro", "Batas Médicas", "Estetoscopio",
  "Termometro", "Lanyard", "Oximetro", "Tijeras Trauma", "Cinta Metrica", "Portacarnet",
  "Accesorio Esteto", "Kit De Sutura", "Otoscopio", "Medias Compresivas", "Libretas",
  "Torniquetes", "Linternas", "Portadocumentos", "Martillo Reflejo", "Video Otoscopio", "ORL",
  "Goniometro", "Glucometro", "Pad De Practica", "Kit", "Boligrafo", "Libro", "Nebulizador",
  "Cinta Kinestesica", "Respuesto Littmann", "Bolso", "Pines", "Control", "Lancetas",
  "Kit De Exploracion", "Tiras Reactivas", "Bandas Elasticas", "Estampadas",
  "Kit Generico + Pad", "Martillo Taylor", "Gorro Migraña", "Doppler", "Tens", "Maxikoala",
  "Plicometro", "Plantilas ECG", "Puntador Lasser", "Plantilla ECG", "Morral", "ORL Generico",
];

const T = TAXONOMY;
const attrByCode = new Map(T.attributes.map((a) => [a.code, a]));

describe("TAXONOMY", () => {
  it("cada categoría pertenece a un departamento declarado", () => {
    for (const c of T.categories) expect(T.departments).toContain(c.department);
  });

  it("los atributos que usa cada categoría existen", () => {
    for (const c of T.categories) {
      for (const a of c.attributes) expect(attrByCode.has(a.code), `${c.name}: ${a.code}`).toBe(true);
    }
  });

  it("los paths de categoría son únicos", () => {
    const paths = T.categories.map(categoryPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("las etiquetas de opción son únicas entre tipos (normalizeKey)", () => {
    const keys = Object.values(T.optionValues).flat().map(normalizeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("cada alias de opción apunta a una etiqueta existente", () => {
    const labels = new Set(Object.values(T.optionValues).flat());
    for (const [alias, label] of Object.entries(T.optionAliases)) {
      expect(labels.has(label), `${alias} → ${label}`).toBe(true);
      expect(alias).toBe(normalizeKey(alias));
    }
  });

  it("cada color tiene familia declarada y hex #RRGGBB distinto de #0EA5E9", () => {
    for (const c of T.colors) {
      expect(T.colorFamilies, c.name).toContain(c.family);
      expect(c.hex, c.name).toMatch(/^#[0-9A-F]{6}$/);
      expect(c.hex, c.name).not.toBe("#0EA5E9");
    }
  });

  it("ningún alias (ni nombre) de color se repite entre colores (normalizeKey)", () => {
    const keys = T.colors.flatMap((c) => [c.name, ...c.aliases].map(normalizeKey));
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dup).toEqual([]);
  });

  it("los colores no chocan con etiquetas de opción", () => {
    const options = new Set(Object.values(T.optionValues).flat().map(normalizeKey));
    for (const c of T.colors) {
      for (const k of [c.name, ...c.aliases].map(normalizeKey)) expect(options.has(k), k).toBe(false);
    }
  });

  it("legacyCategoryMap cubre las 52 categorías actuales y apunta a paths existentes", () => {
    for (const legacy of LEGACY_52) {
      const path = T.legacyCategoryMap[legacy];
      expect(path, legacy).toBeDefined();
      expect(findCategory(T, path), `${legacy} → ${path}`).toBeDefined();
    }
  });

  it("las reglas por palabra clave apuntan a paths existentes", () => {
    for (const r of [...T.uniformOverrides, ...T.nameCategoryRules]) {
      expect(findCategory(T, r.category), r.category).toBeDefined();
    }
  });

  it("los valores de attributeKeywords existen en su atributo", () => {
    for (const k of T.attributeKeywords) {
      expect(attrByCode.get(k.attribute)?.values, `${k.attribute}: ${k.value}`).toContain(k.value);
    }
  });

  it("las líneas de cada marca no se repiten", () => {
    for (const b of T.brands) expect(new Set(b.lines.map(normalizeKey)).size).toBe(b.lines.length);
  });
});
