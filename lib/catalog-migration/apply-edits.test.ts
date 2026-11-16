import { describe, expect, it } from "vitest";
import { applyEdits } from "./apply-edits";
import { buildProposal } from "./propose";
import type { ProductEdit, ReviewEdits, VariantEdit } from "./read-review";
import { TAXONOMY } from "./taxonomy";
import { taxonomyHash } from "./workbook-schema";
import { MINI_SNAPSHOT } from "./test-fixtures";

const base = buildProposal(MINI_SNAPSHOT, TAXONOMY);
const productOf = (name: string) => base.products.find((p) => p.name === name)!;

/** Fila de Productos tal como viene prellenada para `name`, con cambios encima. */
function productRow(name: string, over: Partial<ProductEdit> = {}): ProductEdit {
  const p = productOf(name);
  return {
    row: 2,
    proposedName: p.name,
    name: p.name,
    category: p.categoryPath ?? "",
    brand: p.brand ?? "",
    line: p.line ?? "",
    attributes: Object.fromEntries(Object.entries(p.attributes).filter(([, v]) => v.length)),
    status: p.active ? "Activo" : "Desactivar",
    ...over,
  };
}

function variantRow(sku: string, over: Partial<VariantEdit> = {}): VariantEdit {
  const v = base.variants.find((x) => x.sku === sku)!;
  return {
    row: 2,
    sku,
    product: v.productName,
    color: v.color ?? "",
    option: v.option ?? "",
    mergeInto: v.mergeIntoSku ?? "",
    status: v.active ? "Activo" : "Desactivar",
    ...over,
  };
}

function file(over: Partial<ReviewEdits> = {}, name = "pendientes.xlsx"): ReviewEdits {
  return {
    file: name,
    scope: "incomplete",
    snapshotTakenAt: MINI_SNAPSHOT.taken_at,
    taxonomyHash: taxonomyHash(TAXONOMY),
    products: [],
    variants: [],
    brands: [],
    lines: [],
    colors: [],
    values: {},
    ...over,
  };
}

const figsVariant = () => base.variants.find((v) => v.productName === "Figs Dama")!.sku;

describe("applyEdits", () => {
  it("producto editado por nombre propuesto", () => {
    const { proposal, issues } = applyEdits(base, TAXONOMY, [
      file({ products: [productRow("Figs Dama", { attributes: { genero: ["Dama"], corte: ["Recta"], tela: ["Stretch"] } })] }),
    ]);
    expect(issues).toEqual([]);
    const figs = proposal.products.find((p) => p.name === "Figs Dama")!;
    expect(figs.attributes).toMatchObject({ corte: ["Recta"], tela: ["Stretch"] });
    expect(figs.notes.filter((n) => n.startsWith("Falta"))).toEqual([]);
  });

  it("compara sin mayúsculas, acentos ni espacios y guarda el valor canónico", () => {
    const { proposal, issues } = applyEdits(base, TAXONOMY, [
      file({
        products: [
          productRow("Rompe Ampollas 3D Bob Sponja", { brand: "world medics " }),
          productRow("Figs Dama", { attributes: { genero: ["dama"], corte: ["RECTA"], tela: ["algodon"] } }),
        ],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(proposal.products.find((p) => p.name === "Rompe Ampollas 3D Bob Sponja")!.brand).toBe("World Medics");
    expect(proposal.products.find((p) => p.name === "Figs Dama")!.attributes.tela).toEqual(["Algodón"]);
  });

  it("valor que no existe es issue con fila y columna, y no cambia el producto", () => {
    const { proposal, issues } = applyEdits(base, TAXONOMY, [
      file({ products: [productRow("Rompe Ampollas 3D Bob Sponja", { brand: "FR", row: 7 })] }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: "pendientes.xlsx", sheet: "Productos", row: 7, column: "Marca" });
    expect(issues[0].message).toMatch(/«FR»/);
    expect(proposal.products.find((p) => p.name === "Rompe Ampollas 3D Bob Sponja")!.brand).toBeNull();
  });

  it("marca, valor y color nuevos se agregan a la taxonomía", () => {
    const { proposal, tax, issues } = applyEdits(base, TAXONOMY, [
      file({
        brands: [{ row: 12, name: "FR Medic Group", original: null }],
        values: { tela: ["Stretch", "FIONx"] },
        colors: [{ row: 90, name: "Capibara", hex: "#AA8866", family: "Estampados", original: null }],
        products: [
          productRow("Rompe Ampollas 3D Bob Sponja", { brand: "FR Medic Group" }),
          productRow("Figs Dama", { attributes: { genero: ["Dama"], corte: ["Recta"], tela: ["fionx"] } }),
        ],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(tax.brands.map((b) => b.name)).toContain("FR Medic Group");
    expect(proposal.brands).toContain("FR Medic Group");
    expect(tax.attributes.find((a) => a.code === "tela")!.values).toContain("FIONx");
    expect(tax.colors.find((c) => c.name === "Capibara")).toMatchObject({ hex: "#AA8866", family: "Estampados" });
    expect(proposal.products.find((p) => p.name === "Figs Dama")!.attributes.tela).toEqual(["FIONx"]);
  });

  it("renombre: las variantes llegan por nombre viejo o nuevo", () => {
    const [a, b] = base.variants.filter((v) => v.productName === "Figs Dama" && !v.mergeIntoSku);
    const { proposal, issues } = applyEdits(base, TAXONOMY, [
      file({
        products: [productRow("Figs Dama", { name: "Figs Dama Clásico" })],
        variants: [variantRow(a.sku, { product: "Figs Dama" }), ...(b ? [variantRow(b.sku, { product: "Figs Dama Clásico" })] : [])],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(proposal.products.some((p) => p.name === "Figs Dama")).toBe(false);
    for (const v of proposal.variants.filter((x) => x.sku === a.sku || x.sku === b?.sku)) {
      expect(v.productName).toBe("Figs Dama Clásico");
    }
    // las que no venían en el Excel también siguen al producto renombrado
    expect(proposal.variants.filter((v) => v.productName === "Figs Dama")).toEqual([]);
  });

  it("variante: color y opción canónicos, desactivar y producto inexistente", () => {
    const sku = figsVariant();
    const ok = applyEdits(base, TAXONOMY, [
      file({ variants: [variantRow(sku, { color: "azul cielo", option: "xs", status: "Desactivar" })] }),
    ]);
    expect(ok.issues).toEqual([]);
    expect(ok.proposal.variants.find((v) => v.sku === sku)).toMatchObject({ color: "Azul Cielo", option: "XS", active: false });

    const bad = applyEdits(base, TAXONOMY, [file({ variants: [variantRow(sku, { product: "No Existe", color: "Morado Raro" })] })]);
    expect(bad.issues.map((i) => i.column).sort()).toEqual(["Color", "Producto (nombre nuevo)"]);
  });

  it("producto sin fuente es issue no soportado", () => {
    const { issues } = applyEdits(base, TAXONOMY, [file({ products: [productRow("Figs Dama", { proposedName: "", name: "Nuevo" })] })]);
    expect(issues[0].message).toMatch(/no soportado/);
  });

  it("nombre propuesto o SKU que ya no existen son issues", () => {
    const { issues } = applyEdits(base, TAXONOMY, [
      file({ products: [productRow("Figs Dama", { proposedName: "Borrado Después" })], variants: [variantRow(figsVariant(), { sku: "NO-EXISTE" })] }),
    ]);
    expect(issues.map((i) => i.sheet).sort()).toEqual(["Productos", "Variantes"]);
  });

  it("línea de otra marca es issue", () => {
    const { issues } = applyEdits(base, TAXONOMY, [file({ products: [productRow("Figs Dama", { line: "Mao" })] })]);
    expect(issues[0]).toMatchObject({ column: "Línea / modelo" });
  });

  it("el último archivo gana", () => {
    const { proposal } = applyEdits(base, TAXONOMY, [
      file({ products: [productRow("Gorro Cafe", { category: "Accesorios › Otros accesorios" })] }, "a.xlsx"),
      file({ products: [productRow("Gorro Cafe", { category: "Uniformes › Gorros", attributes: { tematica: ["Liso"] } })] }, "b.xlsx"),
    ]);
    expect(proposal.products.find((p) => p.name === "Gorro Cafe")!.categoryPath).toBe("Uniformes › Gorros");
  });

  it("no modifica la propuesta ni la taxonomía de entrada", () => {
    const before = JSON.stringify(base);
    const taxBrands = TAXONOMY.brands.length;
    applyEdits(base, TAXONOMY, [file({ brands: [{ row: 13, name: "Otra", original: null }], products: [productRow("Figs Dama", { brand: "Otra" })] })]);
    expect(JSON.stringify(base)).toBe(before);
    expect(TAXONOMY.brands).toHaveLength(taxBrands);
  });
});

describe("applyEdits: integridad de los maestros", () => {
  it("archivo generado con otra taxonomía es issue y no se aplica", () => {
    const { proposal, issues } = applyEdits(base, TAXONOMY, [
      file({ taxonomyHash: "otra", products: [productRow("Rompe Ampollas 3D Bob Sponja", { brand: "Figs" })] }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ sheet: "_info", message: expect.stringMatching(/otra versión de la taxonomía/) });
    expect(proposal.products.find((p) => p.name === "Rompe Ampollas 3D Bob Sponja")!.brand).toBeNull();
  });

  it("renombrar una marca a otra que ya existe es issue y no fusiona", () => {
    const { proposal, issues } = applyEdits(base, TAXONOMY, [
      file({ brands: [{ row: 3, name: "World Medics", original: "Figs" }] }),
    ]);
    expect(issues[0]).toMatchObject({ sheet: "Marcas", row: 3, column: "Marca" });
    expect(proposal.products.find((p) => p.name === "Figs Dama")!.brand).toBe("Figs");
  });

  it("renombrar una marca u otro color cuyo original no existe es issue", () => {
    const { issues } = applyEdits(base, TAXONOMY, [
      file({
        brands: [{ row: 4, name: "Nueva", original: "No Existe" }],
        colors: [{ row: 5, name: "Nuevo", hex: "#112233", family: "Azules", original: "No Existe" }],
      }),
    ]);
    expect(issues.map((i) => i.sheet).sort()).toEqual(["Colores", "Marcas"]);
  });

  it("renombrar un color a otro que ya existe es issue", () => {
    const { issues } = applyEdits(base, TAXONOMY, [
      file({ colors: [{ row: 6, name: "Negro", hex: "", family: "", original: "Amarillo" }] }),
    ]);
    expect(issues[0]).toMatchObject({ sheet: "Colores", row: 6, column: "Color" });
  });

  it("hex inválido o familia desconocida es issue y conserva lo anterior", () => {
    const before = TAXONOMY.colors.find((c) => c.name === "Amarillo")!;
    const { tax, issues } = applyEdits(base, TAXONOMY, [
      file({
        colors: [
          { row: 7, name: "Amarillo", hex: "red;background:url(x)", family: "Inventada", original: "Amarillo" },
          { row: 8, name: "Capibara", hex: "#12345", family: "Estampados", original: null },
        ],
      }),
    ]);
    expect(issues.map((i) => `${i.row}:${i.column}`).sort()).toEqual(["7:Familia", "7:Hex", "8:Hex"]);
    expect(tax.colors.find((c) => c.name === "Amarillo")).toMatchObject({ hex: before.hex, family: before.family });
    expect(tax.colors.some((c) => c.name === "Capibara")).toBe(false);
  });
});

describe("applyEdits: identidad de productos y estado", () => {
  it("renombres que reutilizan un nombre liberado: cada variante va a su producto de origen", () => {
    const gxx3 = base.variants.find((v) => v.sku === "GXX-3")!; // Gorro Anestesia
    const gxx4 = base.variants.find((v) => v.sku === "GXX-4")!; // Gorro Cafe
    const { proposal, issues } = applyEdits(base, TAXONOMY, [
      file({
        products: [
          productRow("Gorro Cafe", { name: "Gorro Cafe Oscuro" }),
          productRow("Gorro Anestesia", { name: "Gorro Cafe" }),
        ],
        variants: [variantRow(gxx3.sku, { product: "Gorro Anestesia" }), variantRow(gxx4.sku, { product: "Gorro Cafe" })],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(proposal.variants.find((v) => v.sku === "GXX-3")!.productName).toBe("Gorro Cafe");
    expect(proposal.variants.find((v) => v.sku === "GXX-4")!.productName).toBe("Gorro Cafe Oscuro");
  });

  it("un archivo posterior que deshace un renombre termina (no se cuelga) y gana el último", () => {
    const { proposal } = applyEdits(base, TAXONOMY, [
      file({ products: [productRow("Gorro Cafe", { name: "Gorro Marron" })] }, "completo.xlsx"),
      file({ products: [productRow("Gorro Cafe")], variants: [variantRow("GXX-4", { product: "Gorro Marron" })] }, "pendientes.xlsx"),
    ]);
    expect(proposal.products.some((p) => p.name === "Gorro Cafe")).toBe(true);
    expect(proposal.variants.find((v) => v.sku === "GXX-4")!.productName).toBe("Gorro Cafe");
  });

  it("estado: se compara sin mayúsculas; vacío o desconocido es issue y conserva el anterior", () => {
    const ok = applyEdits(base, TAXONOMY, [file({ products: [productRow("Figs Dama", { status: "desactivar" })] })]);
    expect(ok.issues).toEqual([]);
    expect(ok.proposal.products.find((p) => p.name === "Figs Dama")!.active).toBe(false);

    for (const status of ["Activa", "", "Activo."]) {
      const bad = applyEdits(base, TAXONOMY, [
        file({ products: [productRow("Figs Dama", { status })], variants: [variantRow("GXX-4", { status })] }),
      ]);
      expect(bad.issues.map((i) => `${i.sheet}:${i.column}`).sort()).toEqual(["Productos:Estado", "Variantes:Estado"]);
      expect(bad.proposal.products.find((p) => p.name === "Figs Dama")!.active).toBe(true);
      expect(bad.proposal.variants.find((v) => v.sku === "GXX-4")!.active).toBe(true);
    }
  });
});
