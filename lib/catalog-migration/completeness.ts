/**
 * ¿Qué le falta a un producto propuesto para quedar clasificado? Es el «Criterio de éxito» del
 * spec: todo producto activo con categoría, marca y los atributos obligatorios de su categoría.
 * Lo usan el Excel de pendientes (qué filas van y qué celdas se marcan) y la limpieza (plan 2).
 */
import type { ProposedProduct } from "./propose";
import { findCategory, type CategoryDef, type Taxonomy } from "./taxonomy";

/** Claves de columna de la hoja Productos: `category`, `brand` o `attr:<code>`. */
export type MissingField = "category" | "brand" | `attr:${string}`;

const categoryOf = (p: ProposedProduct, tax: Taxonomy): CategoryDef | undefined =>
  p.categoryPath ? findCategory(tax, p.categoryPath) : undefined;

/** Campos obligatorios vacíos, en el orden de las columnas del Excel. */
export function missingFields(p: ProposedProduct, tax: Taxonomy): MissingField[] {
  const category = categoryOf(p, tax);
  const missing: MissingField[] = [];
  if (!category) missing.push("category");
  if (!p.brand) missing.push("brand");
  if (category) {
    const required = new Set(category.attributes.filter((a) => a.required).map((a) => a.code));
    for (const a of tax.attributes) {
      if (required.has(a.code) && (p.attributes[a.code] ?? []).length === 0) missing.push(`attr:${a.code}`);
    }
  }
  return missing;
}

/** Lo mismo con los nombres que ve la tienda («Marca», «Corte»…). */
export function missingLabels(p: ProposedProduct, tax: Taxonomy): string[] {
  const names = new Map(tax.attributes.map((a) => [`attr:${a.code}`, a.name]));
  return missingFields(p, tax).map((f) =>
    f === "category" ? "Categoría" : f === "brand" ? "Marca" : (names.get(f) ?? f),
  );
}

export function isIncomplete(p: ProposedProduct, tax: Taxonomy): boolean {
  return p.active && missingFields(p, tax).length > 0;
}

/**
 * Papel de un atributo para el producto según su categoría. Sin categoría válida todavía no se
 * sabe: se deja disponible (opcional) y lo obligatorio se marca al elegir la categoría.
 */
export function attributeRole(
  p: ProposedProduct,
  code: string,
  tax: Taxonomy,
): "required" | "optional" | "n/a" {
  const category = categoryOf(p, tax);
  if (!category) return "optional";
  const link = category.attributes.find((a) => a.code === code);
  if (!link) return "n/a";
  return link.required ? "required" : "optional";
}
