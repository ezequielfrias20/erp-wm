import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mediaPublicUrl } from "./product-images";

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
