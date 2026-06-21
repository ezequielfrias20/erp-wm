/**
 * Helpers de Excel (ExcelJS) para plantillas de carga masiva, exportación y lectura.
 *
 * - `buildWorkbookBlob` arma un .xlsx con columnas con encabezado, anchos y, opcionalmente,
 *   listas desplegables (validación de datos) para evitar errores de tipeo. Las listas se
 *   guardan en una hoja oculta y se referencian por rango (evita el límite de 255 chars y
 *   los problemas con comas dentro de los valores).
 * - `downloadBlob` dispara la descarga en el navegador.
 * - `parseSheet` lee un archivo subido y devuelve filas como objetos { header: valor }.
 */

import ExcelJS from "exceljs";

export type SheetColumn = {
  header: string;
  key: string;
  width?: number;
  /** Si se define, la columna tendrá un dropdown con estos valores. */
  list?: string[];
};

export type SheetSpec = {
  name: string;
  columns: SheetColumn[];
  /** Filas iniciales (para exportar). Keyed por `key` de columna. */
  rows?: Record<string, unknown>[];
  /** A cuántas filas aplicar la validación de dropdown (default 500). */
  validationRows?: number;
  /** Texto de ayuda opcional como primera fila congelada. */
  note?: string;
};

const HIDDEN_SHEET = "_listas";

function colLetter(index: number): string {
  // index es 1-based
  let s = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function buildWorkbookBlob(sheets: SheetSpec[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "World Medics ERP";
  wb.created = new Date();

  // Hoja oculta con las listas de validación.
  const lists = wb.addWorksheet(HIDDEN_SHEET);
  lists.state = "veryHidden";
  const listRanges = new Map<string, string>(); // listKey -> rango absoluto
  let listCol = 0;

  for (const sheet of sheets) {
    for (const col of sheet.columns) {
      if (!col.list || col.list.length === 0) continue;
      listCol += 1;
      const letter = colLetter(listCol);
      col.list.forEach((v, i) => {
        lists.getCell(`${letter}${i + 1}`).value = v;
      });
      const range = `${HIDDEN_SHEET}!$${letter}$1:$${letter}$${col.list.length}`;
      listRanges.set(`${sheet.name}::${col.key}`, range);
    }
  }

  const validationRows = 500;

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.max(12, c.header.length + 2),
    }));

    // Estilo de encabezado.
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0EA5E9" },
    };
    headerRow.alignment = { vertical: "middle" };

    // Filas iniciales (export).
    if (sheet.rows) {
      for (const r of sheet.rows) ws.addRow(r);
    }

    // Validación de dropdown por columna.
    sheet.columns.forEach((c, ci) => {
      const range = listRanges.get(`${sheet.name}::${c.key}`);
      if (!range) return;
      const letter = colLetter(ci + 1);
      const maxRow = (sheet.rows?.length ?? 0) + (sheet.validationRows ?? validationRows);
      for (let row = 2; row <= maxRow + 1; row++) {
        ws.getCell(`${letter}${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [range],
          showErrorMessage: true,
          errorStyle: "stop",
          error: "Elige un valor de la lista.",
          errorTitle: "Valor no válido",
        };
      }
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    // Rich text / hyperlink / formula result de ExcelJS.
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    return "";
  }
  return String(value);
}

/**
 * Lee una hoja de un archivo .xlsx subido y devuelve las filas como objetos
 * con claves = texto del encabezado (trim). Ignora filas totalmente vacías.
 */
export async function parseSheet(
  file: File | ArrayBuffer,
  sheetName?: string,
): Promise<Record<string, string>[]> {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) return [];

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = cellToString(cell.value).trim();
  });

  const out: Record<string, string>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = headers[col];
      if (!key) return;
      const val = cellToString(cell.value).trim();
      obj[key] = val;
      if (val) hasValue = true;
    });
    if (hasValue) out.push(obj);
  });
  return out;
}

/** Lista de nombres de hojas presentes en un archivo (para validar plantillas). */
export async function listSheetNames(file: File | ArrayBuffer): Promise<string[]> {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets.map((w) => w.name);
}
