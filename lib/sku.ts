/**
 * Generación de SKU para variantes de producto.
 *
 * Formato: [CAT]-[slug del nombre]-[0001]
 *   - CAT   : abreviatura (3 letras) de la categoría — ej. "Uniformes" -> "UNI"
 *   - slug  : derivado del nombre del producto — ej. "Scrub Set Clásico" -> "SCRCLA"
 *   - 0001  : correlativo de 4 dígitos por prefijo [CAT]-[slug] (resuelto en servidor)
 *
 * El SKU sólo se autogenera cuando el usuario no trae uno propio.
 */

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "con", "para", "y", "set", "the", "a",
]);

/** Quita acentos/diacríticos y pasa a mayúsculas, dejando sólo A-Z0-9 y espacios. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Abreviatura de categoría: primeras 3 letras significativas. Ej. "Uniformes" -> "UNI". */
export function catAbbr(categoryName: string | null | undefined): string {
  const clean = normalize(categoryName ?? "").replace(/\s/g, "");
  return (clean.slice(0, 3) || "GEN").padEnd(3, "X");
}

/**
 * Slug a partir del nombre del producto: toma las 2 primeras palabras
 * significativas (ignorando conectores) y une sus primeras 3 letras.
 * Ej. "Scrub Set Clásico" -> "SCRCLA"; "Bata" -> "BATA".
 */
export function slugFromName(productName: string | null | undefined): string {
  const words = normalize(productName ?? "")
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
  if (words.length === 0) return "PROD";
  if (words.length === 1) return words[0].slice(0, 6);
  return (words[0].slice(0, 3) + words[1].slice(0, 3)).slice(0, 6);
}

/** Prefijo [CAT]-[slug] sin el correlativo. */
export function skuPrefix(categoryName: string | null | undefined, productName: string | null | undefined): string {
  return `${catAbbr(categoryName)}-${slugFromName(productName)}`;
}

/** Construye el SKU completo a partir del prefijo y un correlativo numérico. */
export function buildSku(
  categoryName: string | null | undefined,
  productName: string | null | undefined,
  seq: number,
): string {
  return `${skuPrefix(categoryName, productName)}-${String(seq).padStart(4, "0")}`;
}

/**
 * Dado el conjunto de SKUs existentes que comparten un prefijo, devuelve el
 * siguiente correlativo libre. Acepta SKUs con o sin el prefijo exacto.
 */
export function nextSeqFromSkus(prefix: string, existing: string[]): number {
  let max = 0;
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  for (const sku of existing) {
    const m = re.exec(sku ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}
