import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildProposal } from "./propose";
import { TAXONOMY } from "./taxonomy";
import { MINI_SNAPSHOT } from "./test-fixtures";
import { buildReviewWorkbook } from "./workbook";
import {
  LIST_RANGES,
  PRODUCT_ROWS_WITH_VALIDATION,
  SHEETS,
  productColumns,
  variantColumns,
} from "./workbook-schema";

async function roundTrip() {
  const wb = buildReviewWorkbook(buildProposal(MINI_SNAPSHOT, TAXONOMY), TAXONOMY, {
    generatedAt: "2026-11-11T00:00:00Z",
  });
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(await wb.xlsx.writeBuffer());
  return out;
}

const headerRow = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1);
const rowWhere = (ws: ExcelJS.Worksheet, col: number, value: string) => {
  for (let r = 2; r <= ws.rowCount; r++) if (ws.getCell(r, col).value === value) return ws.getRow(r);
  throw new Error(`sin fila ${value}`);
};

describe("buildReviewWorkbook", () => {
  it("tiene las hojas en orden y las ocultas como veryHidden", async () => {
    const wb = await roundTrip();
    expect(wb.worksheets.map((w) => w.name)).toEqual(Object.values(SHEETS));
    expect(wb.getWorksheet(SHEETS.lists)!.state).toBe("veryHidden");
    expect(wb.getWorksheet(SHEETS.info)!.state).toBe("veryHidden");
  });

  it("encabezados de Productos = productColumns(TAXONOMY), con Especialidad 2", async () => {
    const headers = headerRow((await roundTrip()).getWorksheet(SHEETS.products)!);
    expect(headers).toEqual(productColumns(TAXONOMY).map((c) => c.header));
    expect(headers).toContain("Especialidad 2");
  });

  it("la fila de «Figs Dama» trae marca, categoría, género y estado", async () => {
    const ws = (await roundTrip()).getWorksheet(SHEETS.products)!;
    const cols = productColumns(TAXONOMY);
    const at = (key: string) => cols.findIndex((c) => c.key === key) + 1;
    const row = rowWhere(ws, 1, "Figs Dama");
    expect(row.getCell(at("brand")).value).toBe("Figs");
    expect(row.getCell(at("category")).value).toBe("Uniformes › Conjuntos");
    expect(row.getCell(at("attr:genero")).value).toBe("Dama");
    expect(row.getCell(at("status")).value).toBe("Activo");
  });

  it("encabezado editable azul y no editable gris", async () => {
    const ws = (await roundTrip()).getWorksheet(SHEETS.products)!;
    const cols = productColumns(TAXONOMY);
    const fill = (key: string) =>
      (ws.getCell(1, cols.findIndex((c) => c.key === key) + 1).fill as ExcelJS.FillPattern).fgColor?.argb;
    expect(fill("name")).toBe("FF0EA5E9");
    expect(fill("sources")).toBe("FFE5E7EB");
  });

  it("Variantes valida «Producto» contra la columna de Productos y cubre todas las filas", async () => {
    const ws = (await roundTrip()).getWorksheet(SHEETS.variants)!;
    const col = variantColumns(MINI_SNAPSHOT.branches).findIndex((c) => c.key === "product") + 1;
    expect(ws.getCell(2, col).dataValidation.formulae).toEqual([LIST_RANGES.products]);
    expect(ws.getCell(ws.rowCount, col).dataValidation.type).toBe("list");
  });

  it("Variantes trae color y opción propuestos y la fusión", async () => {
    const ws = (await roundTrip()).getWorksheet(SHEETS.variants)!;
    const cols = variantColumns(MINI_SNAPSHOT.branches);
    const at = (key: string) => cols.findIndex((c) => c.key === key) + 1;
    const row = rowWhere(ws, at("sku"), "UNI-MAOSTR-0018");
    expect(row.getCell(at("product")).value).toBe("Mao Stretch Dama Recta");
    expect(row.getCell(at("color")).value).toBe("Amarillo");
    expect(row.getCell(at("option")).value).toBe("M");
    expect(row.getCell(at("mergeInto")).value).toBe("UNI-MAOSTR-0017");
  });

  it("Productos deja listas en filas vacías para productos nuevos (fila 1500)", async () => {
    const ws = (await roundTrip()).getWorksheet(SHEETS.products)!;
    const brandCol = productColumns(TAXONOMY).findIndex((c) => c.key === "brand") + 1;
    expect(ws.getCell(PRODUCT_ROWS_WITH_VALIDATION, brandCol).dataValidation.formulae).toEqual([
      LIST_RANGES.brands,
    ]);
  });

  it("_info guarda la fecha de la foto", async () => {
    const ws = (await roundTrip()).getWorksheet(SHEETS.info)!;
    expect(ws.getCell("A1").value).toBe("snapshot_taken_at");
    expect(ws.getCell("B1").value).toBe(MINI_SNAPSHOT.taken_at);
  });

  it("Valores tiene una columna por atributo con sus valores", async () => {
    const ws = (await roundTrip()).getWorksheet(SHEETS.values)!;
    expect(headerRow(ws)).toEqual(TAXONOMY.attributes.map((a) => a.name));
    expect(ws.getCell(2, 1).value).toBe("Dama");
  });

  it("Productos lleva el nombre propuesto (gris) para que plan 2 reconozca renombres", async () => {
    const ws = (await roundTrip()).getWorksheet(SHEETS.products)!;
    const cols = productColumns(TAXONOMY);
    const at = (key: string) => cols.findIndex((c) => c.key === key) + 1;
    expect(cols.find((c) => c.key === "proposedName")?.editable).toBe(false);
    expect(rowWhere(ws, 1, "Figs Dama").getCell(at("proposedName")).value).toBe("Figs Dama");
  });

  it("Marcas y Colores llevan el nombre original y Variantes el precio", async () => {
    const wb = await roundTrip();
    expect(headerRow(wb.getWorksheet(SHEETS.brands)!)).toContain("Original");
    expect(headerRow(wb.getWorksheet(SHEETS.colors)!)).toContain("Original");
    const vCols = variantColumns(MINI_SNAPSHOT.branches);
    expect(vCols.find((c) => c.key === "price")).toMatchObject({ header: "Precio", editable: false });
    const ws = wb.getWorksheet(SHEETS.variants)!;
    const at = (key: string) => vCols.findIndex((c) => c.key === key) + 1;
    expect(rowWhere(ws, at("sku"), "UNI-MAOSTR-0018").getCell(at("price")).value).toBe(10);
  });

  it("_info guarda la huella de la taxonomía", async () => {
    const ws = (await roundTrip()).getWorksheet(SHEETS.info)!;
    const rows = Object.fromEntries((ws.getSheetValues() as unknown[][]).filter(Boolean).map((r) => [r[1], r[2]]));
    expect(rows.taxonomy_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("validaciones en el XML", () => {
  it("ninguna columna tiene listas solapadas (Excel pediría «reparar» el archivo)", async () => {
    const JSZip = (await import("jszip")).default;
    const wb = buildReviewWorkbook(buildProposal(MINI_SNAPSHOT, TAXONOMY), TAXONOMY, {
      generatedAt: "2026-11-11T00:00:00Z",
    });
    const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
    const sheets = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
    for (const file of sheets) {
      const xml = await zip.file(file)!.async("string");
      const sqrefs = [...xml.matchAll(/<dataValidation [^>]*sqref="([^"]+)"/g)].map((m) => m[1]);
      const columns = sqrefs.flatMap((s) => s.split(/\s+/)).map((r) => r.replace(/\d+/g, ""));
      expect(new Set(columns).size, `${file}: ${sqrefs.join(", ")}`).toBe(columns.length);
    }
  });
});
