import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildVariantPhotoUrls, isProductImagePath, mediaPublicUrl } from "./product-images";

describe("isProductImagePath", () => {
  it("acepta rutas nuevas y fotos antiguas bajo product-images", () => {
    expect(isProductImagePath("product-images/p1/m1.jpg")).toBe(true);
    expect(isProductImagePath("product-images/abc.png")).toBe(true);
  });

  it("rechaza rutas externas, segmentos vacíos, puntos y caracteres inseguros", () => {
    for (const bad of [
      "", "product-images", "brand/logo.png", "product-images/../brand/logo.png",
      "product-images/./m1.jpg", "product-images//m1.jpg",
      "product-images/p1/m1.jpg?x=1", "product-images/p1/m1.jpg#a",
      "product-images/p 1/m1.jpg", "https://evil.example/x.png",
    ]) {
      expect(isProductImagePath(bad), bad).toBe(false);
    }
  });
});

const BASE = "https://x.supabase.co";
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
});

describe("mediaPublicUrl", () => {
  it("arma la URL pública de una ruta de foto válida (nueva y vieja)", () => {
    expect(mediaPublicUrl("product-images/p1/m1.jpg")).toBe(
      `${BASE}/storage/v1/object/public/wm-public/product-images/p1/m1.jpg`,
    );
    expect(mediaPublicUrl("product-images/abc.png", 3)).toBe(
      `${BASE}/storage/v1/object/public/wm-public/product-images/abc.png?v=3`,
    );
  });

  it("rechaza rutas fuera de product-images, con .. o con caracteres de URL", () => {
    for (const bad of [
      "brand/logo.png",
      "product-images/../brand/logo.png",
      "product-images/p1/m1.jpg?x=1",
      "product-images/p1/m1.jpg#a",
      "product-images//m1.jpg",
      "https://evil.example/x.png",
    ]) {
      expect(mediaPublicUrl(bad), bad).toBeNull();
    }
  });
});

describe("buildVariantPhotoUrls", () => {
  const variants = [
    { id: "red-s", product_id: "p1", color_id: "red" },
    { id: "red-m", product_id: "p1", color_id: "red" },
    { id: "blue", product_id: "p1", color_id: "blue" },
    { id: "green", product_id: "p1", color_id: "green" },
    { id: "general", product_id: "p1", color_id: null },
    { id: "other-product", product_id: "p2", color_id: "red" },
  ];
  const media = [
    { id: "r2", product_id: "p1", color_id: "red", sort_order: 2, path: "product-images/p1/red-2.jpg" },
    { id: "r1", product_id: "p1", color_id: "red", sort_order: 0, path: "product-images/p1/red.jpg" },
    { id: "b1", product_id: "p1", color_id: "blue", sort_order: 0, path: "product-images/p1/blue.jpg" },
    { id: "g1", product_id: "p1", color_id: null, sort_order: 0, path: "product-images/p1/general.jpg" },
  ];

  it("asigna la primera foto del color a sus tallas y una foto distinta a cada color", () => {
    const urls = buildVariantPhotoUrls(variants, media);
    expect(urls.get("red-s")).toBe(`${BASE}/storage/v1/object/public/wm-public/product-images/p1/red.jpg`);
    expect(urls.get("red-m")).toBe(urls.get("red-s"));
    expect(urls.get("blue")).toBe(`${BASE}/storage/v1/object/public/wm-public/product-images/p1/blue.jpg`);
  });

  it("no presta fotos generales ni de otros colores o productos al color sin foto", () => {
    const urls = buildVariantPhotoUrls(variants, media);
    expect(urls.has("green")).toBe(false);
    expect(urls.has("other-product")).toBe(false);
  });

  it("usa las fotos generales sólo para variantes sin color", () => {
    expect(buildVariantPhotoUrls(variants, media).get("general")).toBe(
      `${BASE}/storage/v1/object/public/wm-public/product-images/p1/general.jpg`,
    );
    expect(buildVariantPhotoUrls(variants, media.filter((photo) => photo.color_id !== null)).has("general")).toBe(false);
  });

  it("sin fotos o con una ruta inválida deja la variante sin imagen", () => {
    expect(buildVariantPhotoUrls(variants, []).size).toBe(0);
    expect(buildVariantPhotoUrls(variants, [{ ...media[1], path: "brand/logo.png" }]).size).toBe(0);
  });

  it("desempata fotos con el mismo orden por id", () => {
    const tied = [{ ...media[1], id: "z", path: "product-images/p1/last.jpg" }, media[1]];
    expect(buildVariantPhotoUrls(variants, tied).get("red-s")).toBe(
      `${BASE}/storage/v1/object/public/wm-public/product-images/p1/red.jpg`,
    );
  });
});
