import { describe, expect, it } from "vitest";
import { classifyBrowseCategory, filterCatalogProducts, type BrowseFilterProduct } from "./browse";

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

  it("distingue los productos sin categoría y sin departamento", () => {
    const direct = { ...products[0], categoryId: null };
    const inactive = { ...products[1], categoryId: null };
    const unassigned = { ...products[2], departmentId: null, categoryId: null };
    const all = [...products, direct, inactive, unassigned];
    expect(filterCatalogProducts(all, { departmentId: "d1", uncategorizedOnly: true })).toEqual([direct, inactive]);
    expect(filterCatalogProducts(all, { unassignedOnly: true })).toEqual([unassigned]);
  });
});

describe("classifyBrowseCategory", () => {
  const categories = new Map([
    ["d1", { id: "d1", parent_id: null, name: "Protección" }],
    ["c1", { id: "c1", parent_id: "d1", name: "Guantes" }],
    ["c2", { id: "c2", parent_id: "d1", name: "Categoría inactiva" }],
  ]);
  const activeCategoryIds = new Set(["c1"]);

  it("mantiene la categoría activa y su departamento", () => {
    expect(classifyBrowseCategory("c1", categories, activeCategoryIds)).toEqual({ departmentId: "d1", categoryId: "c1" });
  });

  it("trata la asignación directa al departamento como producto sin categoría", () => {
    expect(classifyBrowseCategory("d1", categories, activeCategoryIds)).toEqual({ departmentId: "d1", categoryId: null });
  });

  it("conserva el departamento de una categoría inactiva", () => {
    expect(classifyBrowseCategory("c2", categories, activeCategoryIds)).toEqual({ departmentId: "d1", categoryId: null });
  });

  it("deja sin departamento una referencia ausente o nula", () => {
    expect(classifyBrowseCategory("inexistente", categories, activeCategoryIds)).toEqual({ departmentId: null, categoryId: null });
    expect(classifyBrowseCategory(null, categories, activeCategoryIds)).toEqual({ departmentId: null, categoryId: null });
  });
});
