/**
 * Normalización y lectura de nombres y tallas del catálogo actual (para proponer la
 * clasificación nueva).
 */
import type { OptionTypeCode, Taxonomy } from "./taxonomy";

/** Clave de comparación: minúsculas, sin acentos (ñ → n), sin «*», espacios colapsados. */
export function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CONNECTORS = new Set(["de", "del", "la", "las", "los", "y", "e", "o", "con", "para", "en"]);

/**
 * Capitaliza sólo las palabras escritas todo en minúscula (sin dígitos). Respeta lo que ya
 * trae mayúsculas («GMD», «OIS», «Con») y deja los conectores en minúscula salvo al inicio.
 */
export function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      if (word !== word.toLowerCase() || /\d/.test(word)) return word;
      if (i > 0 && CONNECTORS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** «XS · San Juan de los Morros · $35» → «XS» (restos de una importación vieja). */
export function stripBranchPriceSuffix(size: string): string {
  return size.split(" · ")[0].trim();
}

export type ParsedOption = { type: OptionTypeCode; label: string };

type Index = {
  options: Map<string, ParsedOption>;
  colors: Map<string, string>;
};

const indexCache = new WeakMap<Taxonomy, Index>();

function indexOf(tax: Taxonomy): Index {
  let index = indexCache.get(tax);
  if (index) return index;
  const options = new Map<string, ParsedOption>();
  for (const [type, labels] of Object.entries(tax.optionValues) as [OptionTypeCode, string[]][]) {
    for (const label of labels) options.set(normalizeKey(label), { type, label });
  }
  for (const [alias, label] of Object.entries(tax.optionAliases)) {
    const target = options.get(normalizeKey(label));
    if (target) options.set(normalizeKey(alias), target);
  }
  const colors = new Map<string, string>();
  for (const color of tax.colors) {
    for (const text of [color.name, ...color.aliases]) colors.set(normalizeKey(text), color.name);
  }
  index = { options, colors };
  indexCache.set(tax, index);
  return index;
}

export function matchOption(text: string, tax: Taxonomy): ParsedOption | null {
  return indexOf(tax).options.get(normalizeKey(text)) ?? null;
}

/** Nombre canónico del color, o null si el texto no corresponde a ningún color. */
export function matchColor(text: string, tax: Taxonomy): string | null {
  return indexOf(tax).colors.get(normalizeKey(text)) ?? null;
}

export type SizePart =
  | { kind: "option"; option: ParsedOption }
  | { kind: "color"; color: string }
  /** Ya está en el nombre del producto (p. ej. el diseño de un rompe ampollas). */
  | { kind: "redundant"; text: string }
  | { kind: "unknown"; text: string };

/** Lee lo que hoy está guardado como «talla»: opciones, colores, texto redundante o desconocido. */
export function classifySize(size: string, productName: string, tax: Taxonomy): SizePart[] {
  const name = ` ${normalizeKey(productName)} `;
  return stripBranchPriceSuffix(size)
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): SizePart => {
      const option = matchOption(part, tax);
      if (option) return { kind: "option", option };
      const color = matchColor(part, tax);
      if (color) return { kind: "color", color };
      if (name.includes(` ${normalizeKey(part)} `)) return { kind: "redundant", text: part };
      return { kind: "unknown", text: part };
    });
}

export type NameParts = { baseName: string; color: string | null; option: ParsedOption | null };

const MIN_BASE_TOKENS = 2;
const MAX_TAIL_TOKENS = 3;

/**
 * Quita del final del nombre una opción (talla/amarre) y un color, en cualquier orden, sin
 * dejar nunca un nombre de menos de dos palabras («Gorro Rojo» queda igual).
 */
export function extractFromName(name: string, tax: Taxonomy): NameParts {
  const tokens = name.trim().split(/\s+/);
  let color: string | null = null;
  let option: ParsedOption | null = null;

  const takeTail = <T>(match: (text: string) => T | null): T | null => {
    const maxN = Math.min(MAX_TAIL_TOKENS, tokens.length - MIN_BASE_TOKENS);
    for (let n = maxN; n >= 1; n--) {
      const found = match(tokens.slice(-n).join(" "));
      if (found) {
        tokens.splice(-n, n);
        return found;
      }
    }
    return null;
  };

  while (tokens.length > MIN_BASE_TOKENS) {
    if (!option) {
      const found = takeTail((text) => matchOption(text, tax));
      if (found) {
        option = found;
        continue;
      }
    }
    if (!color) {
      const found = takeTail((text) => matchColor(text, tax));
      if (found) {
        color = found;
        continue;
      }
    }
    break;
  }

  return { baseName: titleCase(tokens.join(" ")), color, option };
}
