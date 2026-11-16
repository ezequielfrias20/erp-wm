import { describe, expect, it } from "vitest";
import { buildCleanupPlan, slugify } from "./cleanup-plan";
import { buildProposal } from "./propose";
import { TAXONOMY } from "./taxonomy";
import { MINI_SNAPSHOT } from "./test-fixtures";
import type { CatalogSnapshot } from "./types";

const RUN = "00000000-0000-4000-8000-000000000001";

function planFor(edit: (s: CatalogSnapshot) => void = () => {}) {
  const s: CatalogSnapshot = structuredClone(MINI_SNAPSHOT);
  edit(s);
  const p = buildProposal(s, TAXONOMY);
  return { plan: buildCleanupPlan(s, p, TAXONOMY, RUN), proposal: p, snapshot: s };
}

describe("slugify", () => {
  it("acentos, ñ, espacios, / y * → guiones; nunca vacío", () => {
    expect(slugify("Mao Stretch Dama Recta")).toBe("mao-stretch-dama-recta");
    expect(slugify("Moño")).toBe("mono");
    expect(slugify("  Uniformes ›  Gorros ")).toBe("uniformes-gorros");
    expect(slugify("S-M / Talla*")).toBe("s-m-talla");
    expect(slugify("***")).toBe("x");
  });
});

describe("buildCleanupPlan", () => {
  it("sobreviviente = el de más ventas", () => {
    const { plan } = planFor((s) => {
      s.variants.find((v) => v.sku === "UNI-FIGDAM-0075")!.sale_lines = 5; // p3
    });
    const figs = plan.products.find((p) => p.name === "Figs Dama")!;
    expect(figs.id).toBe("p3");
    expect(figs.mergeIds).toEqual(["p2"]);
  });

  it("sin ventas ni stock: el más antiguo", () => {
    const figs = planFor().plan.products.find((p) => p.name === "Figs Dama")!;
    expect(figs).toMatchObject({ id: "p2", mergeIds: ["p3"] });
  });

  it("todas las variantes de los productos fusionados apuntan al sobreviviente", () => {
    const { plan } = planFor();
    const gorro = plan.products.find((p) => p.name === "Gorro Baby Yoda")!;
    const skus = plan.variants.filter((v) => v.productId === gorro.id).map((v) => v.sku).sort();
    expect(skus).toEqual(["GXX-1", "GXX-2"]);
  });

  it("variantes: opción tipada, color, fusión por id", () => {
    const { plan } = planFor();
    const v = (sku: string) => plan.variants.find((x) => x.sku === sku)!;
    expect(v("GXX-1").option).toEqual({ type: "amarre", label: "Moño" });
    expect(v("UNI-MAOSTR-0017")).toMatchObject({ color: "Amarillo", option: { type: "talla", label: "M" }, mergeIntoId: null });
    expect(v("UNI-MAOSTR-0018").mergeIntoId).toBe("v-UNI-MAOSTR-0017");
  });

  it("slugs únicos: choque restante → sufijo -2", () => {
    const { plan } = planFor();
    expect(plan.products.find((p) => p.name === "Oximetro GMD")!.slug).toBe("oximetro-gmd");
    expect(plan.products.find((p) => p.name === "Oximetro Dr John")!.slug).toBe("oximetro-dr-john");

    const s: CatalogSnapshot = structuredClone(MINI_SNAPSHOT);
    const p = buildProposal(s, TAXONOMY);
    p.products.find((x) => x.name === "Gorro Cafe")!.name = "Gorro Café";
    for (const v of p.variants) if (v.productName === "Gorro Cafe") v.productName = "Gorro Café";
    p.products.find((x) => x.name === "Gorro Anestesia")!.name = "Gorro Cafe";
    for (const v of p.variants) if (v.productName === "Gorro Anestesia") v.productName = "Gorro Cafe";
    const slugs = buildCleanupPlan(s, p, TAXONOMY, RUN).products.map((x) => x.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain("gorro-cafe-2");
  });

  it("reutiliza categorías, marcas y colores existentes por nombre", () => {
    const { plan } = planFor();
    expect(plan.departments.find((d) => d.name === "Uniformes")!.reuseId).toBe("c-uni");
    expect(plan.categories.find((c) => c.name === "Gorros")!.reuseId).toBe("c-gor");
    expect(plan.categories.find((c) => c.name === "Tensiómetros")!.reuseId).toBeNull();
    expect(plan.brands.find((b) => b.name === "World Medics")!.reuseId).toBe("br-wm");
    expect(plan.colors.find((c) => c.name === "Mostaza")!.reuseId).toBe("col-5");
    expect(plan.legacyColorIds).toContain("col-4");
    expect(plan.legacyColorIds).not.toContain("col-5");
  });

  it("categorías viejas que no son nodo nuevo van a legacyCategoryIds", () => {
    const { plan } = planFor();
    expect(plan.legacyCategoryIds.sort()).toEqual(["c-med", "c-oxi", "c-rom", "c-ten", "c-tij"]);
  });

  it("categoría con su tipo de opción, color y atributos", () => {
    const gorros = planFor().plan.categories.find((c) => c.name === "Gorros")!;
    expect(gorros).toMatchObject({ department: "Uniformes", optionType: "amarre", requiresColor: false, slug: "gorros" });
    expect(gorros.attributes[0]).toEqual({ code: "tematica", required: true, sortOrder: 1 });
  });

  it("producto: categoría de 2.º nivel, marca y sólo los atributos de su categoría", () => {
    const mao = planFor().plan.products.find((p) => p.name === "Mao Stretch Dama Recta")!;
    expect(mao).toMatchObject({ category: "Conjuntos", brand: "World Medics", isActive: true });
    expect(mao.attributes).toEqual([
      { code: "genero", value: "Dama" },
      { code: "corte", value: "Recta" },
      { code: "tela", value: "Stretch" },
    ]);
  });

  it("fotos: grupo con un color por fuente → foto de ese color; fuente única → general", () => {
    const { plan } = planFor((s) => {
      s.products.find((p) => p.id === "p8")!.has_image = true;
    });
    const figs = plan.media.filter((m) => m.productId === "p2");
    expect(figs).toEqual([
      { productId: "p2", color: "Amatista", path: "product-images/p2.png", sortOrder: 0 },
      { productId: "p2", color: "Azul Cielo", path: "product-images/p3.png", sortOrder: 1 },
    ]);
    expect(plan.media.find((m) => m.productId === "p8")).toEqual({
      productId: "p8",
      color: null,
      path: "product-images/p8.png",
      sortOrder: 0,
    });
  });

  it("guarda con conteos y la última edición de la foto", () => {
    const { plan, snapshot } = planFor();
    const max = [...snapshot.products, ...snapshot.variants].map((x) => x.updated_at).sort().at(-1);
    expect(plan.guard).toEqual({ products: 15, variants: 19, maxUpdatedAt: max });
    expect(plan).toMatchObject({ runId: RUN, snapshotTakenAt: MINI_SNAPSHOT.taken_at });
  });
});
