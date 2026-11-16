/**
 * Contrato del Excel de revisión del catálogo: nombres de hojas, columnas y rangos de listas.
 * Lo escribe `workbook.ts` (plan 1) y lo lee la limpieza (plan 2): cambiarlo rompe la lectura.
 */
import { createHash } from "node:crypto";
import type { Taxonomy } from "./taxonomy";

export const FORMAT_VERSION = 1;

export const SHEETS = {
  instructions: "Instrucciones",
  products: "Productos",
  variants: "Variantes",
  brands: "Marcas",
  lines: "Líneas",
  colors: "Colores",
  values: "Valores",
  categories: "Categorías",
  lists: "_listas",
  info: "_info",
} as const;

export const STATUS = { active: "Activo", inactive: "Desactivar" } as const;

/**
 * Alcance del archivo (va en `_info` como `scope`). «incomplete» = Excel de pendientes: sólo los
 * productos activos sin clasificar del todo y las variantes activas con nota. Lo que no viene en
 * él se aplica tal como lo propuso el sistema.
 */
export type WorkbookScope = "all" | "incomplete";

export type WorkbookColumn = { key: string; header: string; editable: boolean };

/** Referencia a otra hoja, siempre entre comillas (los nombres llevan acentos). */
export const sheetRef = (sheet: string, range: string) => `'${sheet}'!${range}`;

export const PRODUCT_ROWS_WITH_VALIDATION = 1500;

/** Hojas Marcas y Colores: columna gris con el nombre original, para reconocer renombres. */
export const ORIGINAL_HEADER = "Original";

export const LIST_RANGES = {
  products: sheetRef(SHEETS.products, `$A$2:$A$${PRODUCT_ROWS_WITH_VALIDATION}`),
  brands: sheetRef(SHEETS.brands, "$A$2:$A$300"),
  lines: sheetRef(SHEETS.lines, "$B$2:$B$500"),
  colors: sheetRef(SHEETS.colors, "$A$2:$A$500"),
} as const;

/** Filas con lista en cada columna de la hoja Valores. */
export const VALUES_ROWS = 200;

export const PRODUCT_HEAD: WorkbookColumn[] = [
  { key: "name", header: "Producto (nombre nuevo)", editable: true },
  { key: "category", header: "Departamento › Categoría", editable: true },
  { key: "brand", header: "Marca", editable: true },
  { key: "line", header: "Línea / modelo", editable: true },
];

/** Columna informativa del Excel de pendientes: qué le falta al producto. */
export const MISSING_COLUMN: WorkbookColumn = { key: "missing", header: "Falta completar", editable: false };

export const PRODUCT_TAIL: WorkbookColumn[] = [
  { key: "status", header: "Estado", editable: true },
  /** Nombre que propuso el sistema: si la tienda renombra el producto, plan 2 lo reconoce por aquí. */
  { key: "proposedName", header: "Nombre propuesto", editable: false },
  { key: "sources", header: "Productos actuales que se unen", editable: false },
  { key: "variantCount", header: "Nº variantes", editable: false },
  { key: "stock", header: "Stock total", editable: false },
  { key: "notes", header: "Notas del sistema", editable: false },
  { key: "obs", header: "Observaciones de la tienda", editable: true },
];

/**
 * Columnas de Productos: las fijas + una por atributo (`attr:<code>`), en el orden de la
 * taxonomía. Los atributos de selección múltiple llevan una segunda columna `attr:<code>#2`.
 * `withMissing` (Excel de pendientes) agrega «Falta completar» justo después del nombre.
 */
export function productColumns(tax: Taxonomy, opts: { withMissing?: boolean } = {}): WorkbookColumn[] {
  const attrs = tax.attributes.flatMap((a) => {
    const cols: WorkbookColumn[] = [{ key: `attr:${a.code}`, header: a.name, editable: true }];
    if (a.isMulti) cols.push({ key: `attr:${a.code}#2`, header: `${a.name} 2`, editable: true });
    return cols;
  });
  const [name, ...rest] = PRODUCT_HEAD;
  return [name, ...(opts.withMissing ? [MISSING_COLUMN] : []), ...rest, ...attrs, ...PRODUCT_TAIL];
}

/** Huella de la taxonomía con que se generó el archivo (las RegExp cuentan por su texto). */
export function taxonomyHash(tax: Taxonomy): string {
  const json = JSON.stringify(tax, (_k, v) => (v instanceof RegExp ? v.source : v));
  return createHash("sha256").update(json).digest("hex");
}

/** Columnas de Variantes: info actual (una de stock por sucursal) + propuesta editable. */
export function variantColumns(branches: { id: string; name: string }[]): WorkbookColumn[] {
  return [
    { key: "sku", header: "SKU", editable: false },
    { key: "currentProduct", header: "Producto actual", editable: false },
    { key: "currentColor", header: "Color actual", editable: false },
    { key: "currentSize", header: "Talla actual", editable: false },
    ...branches.map((b) => ({ key: `stock:${b.id}`, header: `Stock ${b.name}`, editable: false })),
    { key: "saleLines", header: "Ventas", editable: false },
    { key: "price", header: "Precio", editable: false },
    { key: "product", header: "Producto (nombre nuevo)", editable: true },
    { key: "color", header: "Color", editable: true },
    { key: "option", header: "Talla / opción", editable: true },
    { key: "mergeInto", header: "Fusionar con SKU", editable: true },
    { key: "status", header: "Estado", editable: true },
    { key: "notes", header: "Notas del sistema", editable: false },
    { key: "obs", header: "Observaciones de la tienda", editable: true },
  ];
}
