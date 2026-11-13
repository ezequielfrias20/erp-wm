/**
 * Excel de revisión del catálogo para la tienda. Mismo método de listas que `lib/excel.ts`
 * (lista en hoja oculta referenciada por rango, validación celda por celda), pero aparte:
 * aquí se corre en Node, hay estilos por columna y listas que apuntan a hojas editables.
 */
import { format } from "date-fns";
import ExcelJS from "exceljs";
import type { Proposal } from "./propose";
import { categoryPath, type Taxonomy } from "./taxonomy";
import {
  FORMAT_VERSION,
  LIST_RANGES,
  PRODUCT_ROWS_WITH_VALIDATION,
  SHEETS,
  STATUS,
  ORIGINAL_HEADER,
  VALUES_ROWS,
  productColumns,
  taxonomyHash,
  sheetRef,
  variantColumns,
  type WorkbookColumn,
} from "./workbook-schema";

const BRAND = "FF0EA5E9";
const GREY_HEAD = "FFE5E7EB";
const GREY_HEAD_TEXT = "FF374151";
const GREY_CELL = "FFF3F4F6";

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function colLetter(index: number): string {
  let s = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function instructions(takenAt: string): string[] {
  const when = format(new Date(takenAt), "dd/MM/yyyy HH:mm");
  return [
    "Revisión del catálogo — World Medics",
    "Este archivo propone cómo quedará organizado el catálogo. El sistema ya llenó casi todo a partir de los nombres actuales: tu trabajo es revisar y corregir.",
    "Las columnas con encabezado AZUL se pueden editar. Las de encabezado GRIS son informativas: no las cambies.",
    "Hoja Productos: cada fila es un producto tal como se verá en la tienda. El nombre no lleva color ni talla, y no puede repetirse. Revisa categoría, marca, línea y características (género, corte, tela…).",
    "Puedes corregir el nombre de un producto, marca o color en su hoja. No hace falta cambiarlo también en Variantes: el sistema los relaciona con las columnas grises «Nombre propuesto» y «Original».",
    "Para UNIR productos: en la hoja Variantes, pon en «Producto (nombre nuevo)» el mismo producto.",
    "Para SEPARAR un producto: agrega una fila nueva en Productos con el nombre nuevo y, en Variantes, asígnale las variantes que le corresponden.",
    "Hoja Variantes: cada fila es una unidad que se cuenta en inventario (por ejemplo Blanco / XS). Revisa el color y la talla u opción.",
    "Si dos filas de Variantes son la misma cosa repetida, escribe en «Fusionar con SKU» el SKU de la que se queda. El stock se suma.",
    "Si un producto o variante ya no se vende, pon Estado = Desactivar. No se borra: deja de mostrarse.",
    "¿Falta una marca, línea, color o valor? Agrégalo al final de su hoja (Marcas, Líneas, Colores o Valores) y aparecerá en las listas.",
    "¿Falta una categoría o algo no encaja? Escríbelo en «Observaciones de la tienda».",
    "Todo producto activo debe quedar con categoría, marca y las características obligatorias de su categoría (ver hoja Categorías). Si falta algo, el sistema no aplicará los cambios y devolverá la lista de lo que falta.",
    `Datos tomados el: ${when}. Lo que se cree o cambie en el sistema después de esa fecha se revisará aparte.`,
  ];
}

/** Hoja de datos con encabezado azul (editable) o gris (informativo). */
function dataSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: WorkbookColumn[],
  rows: Record<string, unknown>[],
  widths: Record<string, number> = {},
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: widths[c.key] ?? Math.max(14, c.header.length + 4),
  }));
  columns.forEach((c, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.fill = solid(c.editable ? BRAND : GREY_HEAD);
    cell.font = { bold: true, color: { argb: c.editable ? "FFFFFFFF" : GREY_HEAD_TEXT } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  for (const r of rows) ws.addRow(r);
  columns.forEach((c, i) => {
    if (c.editable) return;
    for (let r = 2; r <= rows.length + 1; r++) ws.getCell(r, i + 1).fill = solid(GREY_CELL);
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

function validate(
  ws: ExcelJS.Worksheet,
  columns: WorkbookColumn[],
  key: string,
  range: string,
  lastRow: number,
) {
  const col = columns.findIndex((c) => c.key === key) + 1;
  if (col === 0) throw new Error(`columna desconocida ${key}`);
  // Un solo rango por columna. Validar celda por celda dispara un bug de ExcelJS: ordena las
  // direcciones como texto («B10» < «B2») y escribe rangos solapados que Excel pide «reparar».
  const letter = colLetter(col);
  (ws as unknown as WithDataValidations).dataValidations.add(`${letter}2:${letter}${lastRow}`, {
    type: "list",
    allowBlank: true,
    formulae: [range],
    showErrorMessage: true,
    errorStyle: "stop",
    error: "Elige un valor de la lista.",
    errorTitle: "Valor no válido",
  });
}

/** `Worksheet.dataValidations` existe en ExcelJS pero no está en sus tipos. */
type WithDataValidations = {
  dataValidations: { add(address: string, validation: ExcelJS.DataValidation): void };
};

export function buildReviewWorkbook(
  p: Proposal,
  tax: Taxonomy,
  meta: { generatedAt: string },
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "World Medics ERP";
  wb.created = new Date(meta.generatedAt);

  // ── Instrucciones
  const intro = wb.addWorksheet(SHEETS.instructions);
  intro.getColumn(1).width = 120;
  instructions(p.takenAt).forEach((line, i) => {
    const cell = intro.getCell(i + 1, 1);
    cell.value = line;
    cell.alignment = { wrapText: true, vertical: "top" };
    if (i === 0) cell.font = { bold: true, size: 14 };
  });

  // ── Productos
  const pCols = productColumns(tax);
  const productRows = [...p.products]
    .sort(
      (a, b) =>
        (a.categoryPath ?? "~").localeCompare(b.categoryPath ?? "~") || a.name.localeCompare(b.name),
    )
    .map((prod) => {
      const row: Record<string, unknown> = {
        name: prod.name,
        category: prod.categoryPath ?? "",
        brand: prod.brand ?? "",
        line: prod.line ?? "",
        status: prod.active ? STATUS.active : STATUS.inactive,
        proposedName: prod.name,
        sources: prod.sourceNames.join(" · "),
        variantCount: prod.variantCount,
        stock: prod.totalStock,
        notes: prod.notes.join(" · "),
        obs: "",
      };
      for (const a of tax.attributes) {
        const values = prod.attributes[a.code] ?? [];
        row[`attr:${a.code}`] = values[0] ?? "";
        if (a.isMulti) row[`attr:${a.code}#2`] = values[1] ?? "";
      }
      return row;
    });
  const products = dataSheet(wb, SHEETS.products, pCols, productRows, {
    name: 34, category: 34, sources: 50, notes: 50, obs: 40,
  });

  // ── Variantes
  const vCols = variantColumns(p.branches);
  const variantRows = [...p.variants]
    .sort(
      (a, b) =>
        a.productName.localeCompare(b.productName) ||
        (a.color ?? "").localeCompare(b.color ?? "") ||
        (a.option ?? "").localeCompare(b.option ?? ""),
    )
    .map((v) => {
      const row: Record<string, unknown> = {
        sku: v.sku,
        currentProduct: v.currentProductName,
        currentColor: v.currentColor ?? "",
        currentSize: v.currentSize ?? "",
        saleLines: v.saleLines,
        price: v.price,
        product: v.productName,
        color: v.color ?? "",
        option: v.option ?? "",
        mergeInto: v.mergeIntoSku ?? "",
        status: v.active ? STATUS.active : STATUS.inactive,
        notes: v.notes.join(" · "),
        obs: "",
      };
      for (const b of p.branches) row[`stock:${b.id}`] = v.stockByBranch[b.id] ?? 0;
      return row;
    });
  const variants = dataSheet(wb, SHEETS.variants, vCols, variantRows, {
    sku: 20, currentProduct: 34, product: 34, notes: 40, obs: 40,
  });

  // ── Marcas
  const productsByBrand = new Map<string, number>();
  for (const prod of p.products) {
    if (prod.brand) productsByBrand.set(prod.brand, (productsByBrand.get(prod.brand) ?? 0) + 1);
  }
  const bCols: WorkbookColumn[] = [
    { key: "brand", header: "Marca", editable: true },
    { key: "original", header: ORIGINAL_HEADER, editable: false },
    { key: "count", header: "Productos actuales", editable: false },
  ];
  dataSheet(
    wb,
    SHEETS.brands,
    bCols,
    p.brands.map((b) => ({ brand: b, original: b, count: productsByBrand.get(b) ?? 0 })),
    { brand: 28, original: 28 },
  );

  // ── Líneas
  const lCols: WorkbookColumn[] = [
    { key: "brand", header: "Marca", editable: true },
    { key: "line", header: "Línea / modelo", editable: true },
  ];
  const lines = dataSheet(wb, SHEETS.lines, lCols, p.lines.map((l) => ({ brand: l.brand, line: l.line })), { brand: 28, line: 28 });

  // ── Colores
  const cCols: WorkbookColumn[] = [
    { key: "name", header: "Color", editable: true },
    { key: "hex", header: "Hex", editable: true },
    { key: "family", header: "Familia", editable: true },
    { key: "original", header: ORIGINAL_HEADER, editable: false },
    { key: "used", header: "Variantes que lo usan", editable: false },
  ];
  const colors = dataSheet(
    wb,
    SHEETS.colors,
    cCols,
    p.colors.map((c) => ({
      name: c.name,
      hex: c.hex,
      family: c.family,
      original: c.name,
      used: p.usage.colors[c.name] ?? 0,
    })),
    { name: 26, family: 24, original: 26 },
  );

  // ── Valores (una columna por atributo)
  const values = wb.addWorksheet(SHEETS.values, { views: [{ state: "frozen", ySplit: 1 }] });
  tax.attributes.forEach((a, i) => {
    const head = values.getCell(1, i + 1);
    head.value = a.name;
    head.fill = solid(BRAND);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    values.getColumn(i + 1).width = Math.max(18, a.name.length + 4);
    a.values.forEach((v, j) => (values.getCell(j + 2, i + 1).value = v));
  });

  // ── Categorías (referencia)
  const attrName = new Map(tax.attributes.map((a) => [a.code, a.name]));
  const optionName = { talla: "Talla", amarre: "Amarre" } as const;
  const kCols: WorkbookColumn[] = [
    { key: "path", header: "Departamento › Categoría", editable: false },
    { key: "option", header: "Opción de variante", editable: false },
    { key: "color", header: "Exige color", editable: false },
    { key: "required", header: "Atributos obligatorios", editable: false },
    { key: "optional", header: "Atributos opcionales", editable: false },
  ];
  dataSheet(
    wb,
    SHEETS.categories,
    kCols,
    tax.categories.map((c) => ({
      path: categoryPath(c),
      option: c.optionType ? optionName[c.optionType] : "—",
      color: c.requiresColor ? "Sí" : "No",
      required: c.attributes.filter((a) => a.required).map((a) => attrName.get(a.code)).join(", "),
      optional: c.attributes.filter((a) => !a.required).map((a) => attrName.get(a.code)).join(", "),
    })),
    { path: 40, required: 40, optional: 40 },
  );

  // ── _listas (oculta)
  const listsWs = wb.addWorksheet(SHEETS.lists);
  listsWs.state = "veryHidden";
  const writeList = (col: number, items: string[]) => {
    items.forEach((v, i) => (listsWs.getCell(i + 1, col).value = v));
    const letter = colLetter(col);
    return sheetRef(SHEETS.lists, `$${letter}$1:$${letter}$${Math.max(items.length, 1)}`);
  };
  const categoriesRange = writeList(1, tax.categories.map(categoryPath));
  const optionsRange = writeList(2, Object.values(tax.optionValues).flat());
  const statusRange = writeList(3, [STATUS.active, STATUS.inactive]);
  const familiesRange = writeList(4, tax.colorFamilies);

  // ── _info (oculta)
  const info = wb.addWorksheet(SHEETS.info);
  info.state = "veryHidden";
  info.addRow(["snapshot_taken_at", p.takenAt]);
  info.addRow(["generated_at", meta.generatedAt]);
  info.addRow(["format_version", FORMAT_VERSION]);
  info.addRow(["taxonomy_hash", taxonomyHash(tax)]);

  // ── Validaciones
  const pLast = PRODUCT_ROWS_WITH_VALIDATION;
  validate(products, pCols, "category", categoriesRange, pLast);
  validate(products, pCols, "brand", LIST_RANGES.brands, pLast);
  validate(products, pCols, "line", LIST_RANGES.lines, pLast);
  validate(products, pCols, "status", statusRange, pLast);
  tax.attributes.forEach((a, i) => {
    const letter = colLetter(i + 1);
    const range = sheetRef(SHEETS.values, `$${letter}$2:$${letter}$${VALUES_ROWS}`);
    validate(products, pCols, `attr:${a.code}`, range, pLast);
    if (a.isMulti) validate(products, pCols, `attr:${a.code}#2`, range, pLast);
  });

  const vLast = variantRows.length + 1;
  validate(variants, vCols, "product", LIST_RANGES.products, vLast);
  validate(variants, vCols, "color", LIST_RANGES.colors, vLast);
  validate(variants, vCols, "option", optionsRange, vLast);
  validate(variants, vCols, "status", statusRange, vLast);

  validate(lines, lCols, "brand", LIST_RANGES.brands, 500);
  validate(colors, cCols, "family", familiesRange, 500);

  return wb;
}
