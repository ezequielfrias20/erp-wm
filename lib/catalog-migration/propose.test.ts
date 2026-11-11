import { describe, expect, it } from "vitest";
import { buildProposal } from "./propose";
import { TAXONOMY } from "./taxonomy";
import { MINI_SNAPSHOT } from "./test-fixtures";

const p = buildProposal(MINI_SNAPSHOT, TAXONOMY);
const prod = (n: string) => {
  const found = p.products.find((x) => x.name === n);
  if (!found) throw new Error(`sin producto «${n}»: ${p.products.map((x) => x.name).join(", ")}`);
  return found;
};
const vari = (sku: string) => p.variants.find((x) => x.sku === sku)!;

describe("buildProposal", () => {
  it("une los «Figs Dama» aunque uno no tenga marca ni categoría", () => {
    expect(prod("Figs Dama").sourceProductIds).toHaveLength(2);
    expect(prod("Figs Dama").brand).toBe("Figs");
    expect(prod("Figs Dama").categoryPath).toBe("Uniformes › Conjuntos");
    expect(prod("Figs Dama").attributes.genero).toEqual(["Dama"]);
  });

  it("une gorros por diseño y pasa el amarre a la opción", () => {
    expect(prod("Gorro Baby Yoda").variantCount).toBe(2);
    expect(vari("GXX-1").option).toBe("Moño");
    expect(vari("GXX-2").option).toBe("Tiras");
  });

  it("saca color y opción del nombre cuando la variante no los tiene", () => {
    expect(vari("GXX-3")).toMatchObject({ productName: "Gorro Anestesia", color: "Azul", option: "Tiras" });
    expect(prod("Gorro Anestesia").attributes).toMatchObject({
      tematica: ["Especialidad médica"],
      especialidad: ["Anestesiología"],
    });
  });

  it("no une productos de marcas distintas y les da nombres distintos", () => {
    expect(prod("Oximetro GMD")).toBeDefined();
    expect(prod("Oximetro Dr John")).toBeDefined();
    expect(p.products.filter((x) => x.name === "Oximetro")).toHaveLength(0);
  });

  it("marca variantes repetidas para fusionar con la que más vende", () => {
    expect(vari("UNI-MAOSTR-0018").mergeIntoSku).toBe("UNI-MAOSTR-0017");
    expect(vari("UNI-MAOSTR-0017").mergeIntoSku).toBeNull();
    expect(vari("OXX-2").mergeIntoSku).toBe("OXX-1");
    expect(vari("UNI-MAOMIC-0002").mergeIntoSku).toBe("UNI-MAOMIC-0001");
  });

  it("limpia la talla con sufijo de sucursal y precio", () => {
    expect(vari("UXX-MAOSTRDA-0469")).toMatchObject({ color: "Vinotinto", option: "XS" });
  });

  it("propone línea y atributos para uniformes World Medics", () => {
    expect(prod("Mao Stretch Dama Recta")).toMatchObject({
      line: "Mao",
      attributes: { genero: ["Dama"], corte: ["Recta"], tela: ["Stretch"] },
    });
    expect(prod("Mao Mic Dama Recta").attributes.tela).toEqual(["Mic"]);
  });

  it("une tijeras por color y adivina la marca por el nombre", () => {
    expect(prod("Tijeras Trauma GMD Tornasol")).toMatchObject({ brand: "GMD", variantCount: 2 });
    expect(vari("TTX-0348").color).toBe("Morado");
  });

  it("medias: opción S-M y color estampado, en su categoría", () => {
    expect(vari("MCX-0632")).toMatchObject({
      productName: "Medias Compresivas 15-20 Mmhg",
      option: "S-M",
      color: "Batido Amarillo",
    });
    expect(prod("Medias Compresivas 15-20 Mmhg").categoryPath).toBe("Uniformes › Medias de compresión");
  });

  it("descarta lo redundante sin dejar notas de revisión", () => {
    expect(vari("RAX-0295")).toMatchObject({ option: null, notes: [] });
    expect(vari("TXX-0257").option).toBeNull();
    expect(prod("Tensiometro GMD Digital Con Voz").attributes).toMatchObject({
      voz: ["Con voz"],
      tipo_tensiometro: ["Digital de brazo"],
    });
  });

  it("estadísticas", () => {
    expect(p.stats.productsBefore).toBe(15);
    expect(p.stats.productsAfter).toBe(12);
    expect(p.stats.mergedGroups).toBe(3); // Figs Dama, Gorro Baby Yoda, Tijeras
    expect(p.stats.duplicateVariants).toBe(3);
    expect(p.unresolved.colors).toEqual([]);
  });

  it("un nombre de categoría actual como «constructor» no rompe la propuesta", () => {
    const snap = {
      ...MINI_SNAPSHOT,
      categories: [...MINI_SNAPSHOT.categories, { id: "c-x", name: "constructor" }],
      products: [...MINI_SNAPSHOT.products, { ...MINI_SNAPSHOT.products[0], id: "px", name: "Cosa Rara", category_id: "c-x" }],
    };
    const q = buildProposal(snap, TAXONOMY);
    expect(q.products.find((x) => x.name === "Cosa Rara")?.categoryPath).toBeNull();
  });
});
