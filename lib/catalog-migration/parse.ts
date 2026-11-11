/**
 * Normalización y lectura de nombres y tallas del catálogo actual (para proponer la
 * clasificación nueva).
 */

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
