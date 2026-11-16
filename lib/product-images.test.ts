import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isProductImagePath, mediaPublicUrl } from "./product-images";

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
