import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildProposal } from "./propose";
import { readReviewBuffer } from "./read-review";
import { TAXONOMY } from "./taxonomy";
import { MINI_SNAPSHOT } from "./test-fixtures";
import { buildReviewWorkbook } from "./workbook";
import { SHEETS, productColumns } from "./workbook-schema";

type Scope = "all" | "incomplete";

/** Arma el Excel como lo recibe la tienda, deja que el test lo edite y lo devuelve como buffer. */
async function returned(scope: Scope, edit: (wb: ExcelJS.Workbook) => void = () => {}) {
  const built = buildReviewWorkbook(buildProposal(MINI_SNAPSHOT, TAXONOMY), TAXONOMY, {
    generatedAt: "2026-11-15T00:00:00Z",
    scope,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await built.xlsx.writeBuffer());
  edit(wb);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const findRow = (ws: ExcelJS.Worksheet, value: string) => {
  for (let r = 2; r <= ws.rowCount; r++) if (ws.getCell(r, 1).text === value) return r;
  throw new Error(`sin fila ${value}`);
};
const colOf = (ws: ExcelJS.Worksheet, header: string) => {
  const headers = (ws.getRow(1).values as unknown[]).slice(1);
  const i = headers.indexOf(header);
  if (i < 0) throw new Error(`sin columna ${header}`);
  return i + 1;
};

describe("readReviewBuffer", () => {
  it("lee productos por encabezado, no por posición (pendientes y completo)", async () => {
    for (const scope of ["incomplete", "all"] as const) {
      const edits = await readReviewBuffer(await returned(scope), "x.xlsx", TAXONOMY);
      const figs = edits.products.find((p) => p.proposedName === "Figs Dama")!;
      expect(figs).toMatchObject({
        name: "Figs Dama",
        category: "Uniformes › Conjuntos",
        brand: "Figs",
        status: "Activo",
      });
      expect(figs.attributes.genero).toEqual(["Dama"]);
      expect(figs.row).toBeGreaterThan(1);
    }
  });

  it("recorta espacios e ignora atributos vacíos", async () => {
    const buf = await returned("incomplete", (wb) => {
      const ws = wb.getWorksheet(SHEETS.products)!;
      ws.getCell(findRow(ws, "Figs Dama"), colOf(ws, "Tela")).value = "Fionx ";
    });
    const figs = (await readReviewBuffer(buf, "x.xlsx", TAXONOMY)).products.find((p) => p.proposedName === "Figs Dama")!;
    expect(figs.attributes.tela).toEqual(["Fionx"]);
    expect(figs.attributes).not.toHaveProperty("corte");
  });

  it("Especialidad 2 se junta con Especialidad", async () => {
    const buf = await returned("all", (wb) => {
      const ws = wb.getWorksheet(SHEETS.products)!;
      ws.getCell(findRow(ws, "Gorro Anestesia"), colOf(ws, "Especialidad 2")).value = "Enfermería";
    });
    const gorro = (await readReviewBuffer(buf, "x.xlsx", TAXONOMY)).products.find((p) => p.proposedName === "Gorro Anestesia")!;
    expect(gorro.attributes.especialidad).toEqual(["Anestesiología", "Enfermería"]);
  });

  it("variantes: SKU, producto, color, opción, fusión y estado", async () => {
    const edits = await readReviewBuffer(await returned("all"), "x.xlsx", TAXONOMY);
    expect(edits.variants.find((v) => v.sku === "UNI-MAOSTR-0018")).toMatchObject({
      product: "Mao Stretch Dama Recta",
      color: "Amarillo",
      option: "M",
      mergeInto: "UNI-MAOSTR-0017",
      status: "Activo",
    });
  });

  it("marca nueva = fila sin Original; línea, color y valores se leen", async () => {
    const buf = await returned("incomplete", (wb) => {
      const brands = wb.getWorksheet(SHEETS.brands)!;
      brands.getCell(brands.rowCount + 1, 1).value = "FR Medic Group";
      const values = wb.getWorksheet(SHEETS.values)!;
      const tela = colOf(values, "Tela");
      let r = 2;
      while (values.getCell(r, tela).text) r++;
      values.getCell(r, tela).value = "FIONx";
    });
    const edits = await readReviewBuffer(buf, "x.xlsx", TAXONOMY);
    expect(edits.brands).toContainEqual({ row: expect.any(Number), name: "FR Medic Group", original: null });
    expect(edits.brands).toContainEqual({ row: expect.any(Number), name: "Figs", original: "Figs" });
    expect(edits.values.tela).toContain("FIONx");
    expect(edits.colors.find((c) => c.name === "Amarillo")).toMatchObject({ original: "Amarillo" });
    expect(edits.lines.length).toBeGreaterThan(0);
  });

  it("lee _info", async () => {
    const edits = await readReviewBuffer(await returned("incomplete"), "x.xlsx", TAXONOMY);
    expect(edits).toMatchObject({ file: "x.xlsx", scope: "incomplete", snapshotTakenAt: MINI_SNAPSHOT.taken_at });
    expect(edits.taxonomyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("encabezado faltante es error que nombra hoja y encabezado", async () => {
    const buf = await returned("all", (wb) => {
      const ws = wb.getWorksheet(SHEETS.products)!;
      ws.getCell(1, productColumns(TAXONOMY).findIndex((c) => c.key === "brand") + 1).value = "Marca vieja";
    });
    await expect(readReviewBuffer(buf, "x.xlsx", TAXONOMY)).rejects.toThrow(/Productos.*«Marca»/);
  });
});
