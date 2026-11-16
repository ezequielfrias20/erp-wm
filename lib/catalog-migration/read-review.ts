/**
 * Lee un Excel de revisión devuelto por la tienda (completo o de pendientes). Sólo extrae lo
 * que dice cada celda; validar y aplicar es trabajo de `apply-edits.ts`. Las columnas se
 * buscan por encabezado, así que el orden puede cambiar, pero un encabezado que falta es error.
 */
import ExcelJS from "exceljs";
import type { Taxonomy } from "./taxonomy";
import {
  ORIGINAL_HEADER,
  SHEETS,
  STATUS,
  productColumns,
  type WorkbookScope,
} from "./workbook-schema";

export type ProductEdit = {
  row: number;
  /** Columna gris «Nombre propuesto»: clave de cruce con la propuesta. */
  proposedName: string;
  name: string;
  category: string;
  brand: string;
  line: string;
  /** código → valores no vacíos (incluye la columna «#2» de los múltiples). */
  attributes: Record<string, string[]>;
  active: boolean;
};

export type VariantEdit = {
  row: number;
  sku: string;
  product: string;
  color: string;
  option: string;
  mergeInto: string;
  active: boolean;
};

export type ReviewEdits = {
  file: string;
  scope: WorkbookScope;
  snapshotTakenAt: string;
  taxonomyHash: string;
  products: ProductEdit[];
  variants: VariantEdit[];
  /** `original: null` = marca agregada por la tienda. */
  brands: { row: number; name: string; original: string | null }[];
  lines: { brand: string; line: string }[];
  colors: { row: number; name: string; hex: string; family: string; original: string | null }[];
  /** código de atributo → valores de la hoja Valores. */
  values: Record<string, string[]>;
};

export async function readReviewWorkbook(path: string, tax: Taxonomy): Promise<ReviewEdits> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return readWorkbook(wb, path, tax);
}

export async function readReviewBuffer(buf: ArrayBuffer, file: string, tax: Taxonomy): Promise<ReviewEdits> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return readWorkbook(wb, file, tax);
}

const text = (cell: ExcelJS.Cell) => cell.text.trim();

/** Hoja con encabezados en la fila 1: devuelve una función que lee una fila por encabezado. */
function sheet(wb: ExcelJS.Workbook, name: string, required: string[]) {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Falta la hoja «${name}»`);
  const index = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => index.set(text(cell), col));
  for (const h of required) {
    if (!index.has(h)) throw new Error(`Hoja ${name}: falta la columna «${h}»`);
  }
  const rows: { row: number; get: (header: string) => string }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (header: string) => {
      const col = index.get(header);
      return col ? text(row.getCell(col)) : "";
    };
    rows.push({ row: r, get });
  }
  return { rows, has: (h: string) => index.has(h) };
}

function readWorkbook(wb: ExcelJS.Workbook, file: string, tax: Taxonomy): ReviewEdits {
  const header = (key: string) => productColumns(tax).find((c) => c.key === key)!.header;

  // ── Productos
  const attrHeaders = tax.attributes.flatMap((a) =>
    a.isMulti ? [a.name, `${a.name} 2`] : [a.name],
  );
  const fixed = ["name", "category", "brand", "line", "status", "proposedName"].map(header);
  const productsSheet = sheet(wb, SHEETS.products, [...fixed, ...attrHeaders]);
  const products: ProductEdit[] = productsSheet.rows
    .filter((r) => r.get(header("name")) || r.get(header("proposedName")))
    .map((r) => {
      const attributes: Record<string, string[]> = {};
      for (const a of tax.attributes) {
        const values = [r.get(a.name), a.isMulti ? r.get(`${a.name} 2`) : ""].filter(Boolean);
        if (values.length) attributes[a.code] = values;
      }
      return {
        row: r.row,
        proposedName: r.get(header("proposedName")),
        name: r.get(header("name")),
        category: r.get(header("category")),
        brand: r.get(header("brand")),
        line: r.get(header("line")),
        attributes,
        active: r.get(header("status")) === STATUS.active,
      };
    });

  // ── Variantes
  const V = {
    sku: "SKU",
    product: "Producto (nombre nuevo)",
    color: "Color",
    option: "Talla / opción",
    mergeInto: "Fusionar con SKU",
    status: "Estado",
  };
  const variants: VariantEdit[] = sheet(wb, SHEETS.variants, Object.values(V))
    .rows.filter((r) => r.get(V.sku))
    .map((r) => ({
      row: r.row,
      sku: r.get(V.sku),
      product: r.get(V.product),
      color: r.get(V.color),
      option: r.get(V.option),
      mergeInto: r.get(V.mergeInto),
      active: r.get(V.status) === STATUS.active,
    }));

  // ── Maestros
  const brands = sheet(wb, SHEETS.brands, ["Marca", ORIGINAL_HEADER])
    .rows.filter((r) => r.get("Marca"))
    .map((r) => ({ row: r.row, name: r.get("Marca"), original: r.get(ORIGINAL_HEADER) || null }));
  const lines = sheet(wb, SHEETS.lines, ["Marca", "Línea / modelo"])
    .rows.filter((r) => r.get("Línea / modelo"))
    .map((r) => ({ brand: r.get("Marca"), line: r.get("Línea / modelo") }));
  const colors = sheet(wb, SHEETS.colors, ["Color", "Hex", "Familia", ORIGINAL_HEADER])
    .rows.filter((r) => r.get("Color"))
    .map((r) => ({
      row: r.row,
      name: r.get("Color"),
      hex: r.get("Hex"),
      family: r.get("Familia"),
      original: r.get(ORIGINAL_HEADER) || null,
    }));
  const valuesSheet = sheet(wb, SHEETS.values, tax.attributes.map((a) => a.name));
  const values: Record<string, string[]> = {};
  for (const a of tax.attributes) {
    values[a.code] = valuesSheet.rows.map((r) => r.get(a.name)).filter(Boolean);
  }

  // ── _info
  const infoWs = wb.getWorksheet(SHEETS.info);
  if (!infoWs) throw new Error(`Falta la hoja «${SHEETS.info}»`);
  const info = new Map<string, string>();
  infoWs.eachRow((row) => info.set(text(row.getCell(1)), text(row.getCell(2))));
  const scope = (info.get("scope") || "all") as WorkbookScope;

  return {
    file,
    scope,
    snapshotTakenAt: info.get("snapshot_taken_at") ?? "",
    taxonomyHash: info.get("taxonomy_hash") ?? "",
    products,
    variants,
    brands,
    lines,
    colors,
    values,
  };
}
