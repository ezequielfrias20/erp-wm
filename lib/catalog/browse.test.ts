import { describe, expect, it } from "vitest";
import { filterCatalogProducts, type BrowseFilterProduct } from "./browse";

const products: BrowseFilterProduct[] = [
  { name: "Bata Quirúrgica", brandId: "b1", brand: "World Medics", departmentId: "d1", categoryId: "c1", ready: true },
  { name: "Guante Azul", brandId: "b2", brand: "Protec", departmentId: "d1", categoryId: "c2", ready: false },
  { name: "Mascarilla", brandId: null, brand: null, departmentId: "d2", categoryId: "c3", ready: true },
];

describe("filterCatalogProducts", () => {
  it("busca por nombre o marca sin distinguir acentos ni mayúsculas", () => {
    expect(filterCatalogProducts(products, { query: "quirurgica" })).toEqual([products[0]]);
    expect(filterCatalogProducts(products, { query: "PROTEC" })).toEqual([products[1]]);
  });

  it("combina departamento, categoría, marca y estado listo", () => {
    expect(filterCatalogProducts(products, { departmentId: "d1", categoryId: "c2", brandId: "b2" })).toEqual([products[1]]);
    expect(filterCatalogProducts(products, { departmentId: "d1", readyOnly: true })).toEqual([products[0]]);
    expect(filterCatalogProducts(products, { categoryId: "c2", readyOnly: true })).toEqual([]);
  });

  it("conserva todos los productos si no hay filtros", () => {
    expect(filterCatalogProducts(products, {})).toEqual(products);
  });
});
