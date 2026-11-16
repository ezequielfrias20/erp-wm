import { describe, expect, it } from "vitest";
import { isIncomplete } from "./completeness";
import { buildProposal, type Proposal } from "./propose";
import { TAXONOMY } from "./taxonomy";
import { MINI_SNAPSHOT } from "./test-fixtures";
import type { CatalogSnapshot } from "./types";
import { detectDrift, validateForApply } from "./validate";

const base = buildProposal(MINI_SNAPSHOT, TAXONOMY);

/** Propuesta del fixture sin bloqueantes: los incompletos se desactivan. */
function complete(): Proposal {
  const p = structuredClone(base);
  for (const prod of p.products) if (isIncomplete(prod, TAXONOMY)) prod.active = false;
  return p;
}

const later = (iso: string) => new Date(new Date(iso).getTime() + 60_000).toISOString();

describe("detectDrift", () => {
  it("misma foto: sin cambios", () => {
    const d = detectDrift(MINI_SNAPSHOT, MINI_SNAPSHOT);
    expect(Object.values(d).every((list) => list.length === 0)).toBe(true);
  });

  it("producto editado después de la foto, variante nueva y producto borrado", () => {
    const current: CatalogSnapshot = structuredClone(MINI_SNAPSHOT);
    const edited = current.products[0];
    edited.updated_at = later(MINI_SNAPSHOT.taken_at);
    const removed = current.products.pop()!;
    current.variants.push({ ...current.variants[0], id: "v-nueva", sku: "NUEVO-0001" });
    const d = detectDrift(MINI_SNAPSHOT, current);
    expect(d.changedProducts).toEqual([{ id: edited.id, name: edited.name }]);
    expect(d.removedProducts).toEqual([{ id: removed.id, name: removed.name }]);
    expect(d.newVariants).toEqual([{ id: "v-nueva", sku: "NUEVO-0001" }]);
  });

  it("cambios sólo de stock o ventas no cuentan", () => {
    const current: CatalogSnapshot = structuredClone(MINI_SNAPSHOT);
    current.variants[0].stock = { b1: 999 };
    current.variants[0].sale_lines += 5;
    expect(detectDrift(MINI_SNAPSHOT, current).changedVariants).toEqual([]);
  });
});

describe("validateForApply", () => {
  it("propuesta completa no bloquea", () => {
    expect(validateForApply(complete(), TAXONOMY, [])).toEqual([]);
  });

  it("producto activo incompleto bloquea; inactivo no", () => {
    const blockers = validateForApply(base, TAXONOMY, []);
    const rompe = blockers.find((b) => b.ref === "Rompe Ampollas 3D Bob Sponja")!;
    expect(rompe).toMatchObject({ kind: "product" });
    expect(rompe.message).toMatch(/Marca/);
    expect(validateForApply(complete(), TAXONOMY, []).some((b) => b.ref === "Rompe Ampollas 3D Bob Sponja")).toBe(false);
  });

  it("variante activa sin color en Conjuntos bloquea con su SKU", () => {
    const p = complete();
    const v = p.variants.find((x) => x.productName === "Mao Mic Dama Recta" && !x.mergeIntoSku)!;
    v.color = null;
    expect(validateForApply(p, TAXONOMY, [])).toContainEqual({ kind: "variant", ref: v.sku, message: expect.stringMatching(/color/i) });
  });

  it("opción de otro tipo bloquea (talla en un gorro)", () => {
    const p = complete();
    const v = p.variants.find((x) => x.productName === "Gorro Anestesia")!;
    v.option = "M";
    const b = validateForApply(p, TAXONOMY, []).find((x) => x.ref === v.sku)!;
    expect(b.kind).toBe("variant");
    expect(b.message).toMatch(/Amarre/);
  });

  it("repetidas sin fusionar bloquean con ambos SKU", () => {
    const p = complete();
    const [a, b] = p.variants.filter((x) => x.productName === "Mao Stretch Dama Recta" && !x.mergeIntoSku);
    b.color = a.color;
    b.option = a.option;
    const dup = validateForApply(p, TAXONOMY, []).find((x) => x.kind === "duplicate")!;
    expect(dup.message).toContain(a.sku);
    expect(dup.message).toContain(b.sku);
  });

  it("fusiones inválidas bloquean: SKU inexistente, cadena, otro producto u otro color", () => {
    const merged = base.variants.find((x) => x.mergeIntoSku)!;
    const cases: ((p: Proposal) => void)[] = [
      (p) => (p.variants.find((x) => x.sku === merged.sku)!.mergeIntoSku = "NO-EXISTE"),
      (p) => (p.variants.find((x) => x.sku === merged.mergeIntoSku)!.mergeIntoSku = "OTRO"),
      (p) => (p.variants.find((x) => x.sku === merged.sku)!.productName = "Figs Dama"),
      (p) => (p.variants.find((x) => x.sku === merged.sku)!.color = "Negro"),
    ];
    for (const breakIt of cases) {
      const p = complete();
      breakIt(p);
      expect(validateForApply(p, TAXONOMY, []).some((b) => b.kind === "merge")).toBe(true);
    }
  });

  it("issues de edición bloquean", () => {
    const blockers = validateForApply(complete(), TAXONOMY, [
      { file: "a.xlsx", sheet: "Productos", row: 7, column: "Marca", message: "«FR» no está en la lista" },
    ]);
    expect(blockers).toEqual([{ kind: "edit", ref: "a.xlsx · Productos fila 7 · Marca", message: "«FR» no está en la lista" }]);
  });
});
