import { describe, expect, it } from "vitest";
import { MEDIA_MAX_BYTES, mediaFileStillUsed, mediaPath, orderProductColors, pickMainPhoto, validateMediaFile } from "./media";

describe("orderProductColors", () => {
  it("ordena nombres con números de forma natural y elimina colores repetidos", () => {
    const variants = [
      { colorId: "diez", isActive: true, sku: "Z" },
      { colorId: "dos", isActive: true, sku: "A" },
      { colorId: "dos", isActive: false, sku: "B" },
      { colorId: null, isActive: true, sku: "C" },
    ];
    expect(orderProductColors(variants, { diez: "Talla 10", dos: "Talla 2" })).toEqual(["dos", "diez"]);
  });

  it("pone primero colores activos y desempata por id", () => {
    const variants = [
      { colorId: "inactivo", isActive: false, sku: "A" },
      { colorId: "b", isActive: true, sku: "B" },
      { colorId: "a", isActive: true, sku: "C" },
      { colorId: "inactivo", isActive: false, sku: "D" },
    ];
    expect(orderProductColors(variants, { inactivo: "Ámbar", b: "Azul", a: "Azul" })).toEqual(["a", "b", "inactivo"]);
  });
});

describe("validateMediaFile", () => {
  it("rechaza HEIC y menciona JPG, PNG o WebP", () => {
    expect(validateMediaFile({ type: "image/heic", size: 100 }) ?? "").toContain("JPG, PNG o WebP");
  });

  it("rechaza archivos de más de 6 MB", () => {
    expect(validateMediaFile({ type: "image/jpeg", size: MEDIA_MAX_BYTES + 1 }) ?? "").toContain("6 MB");
  });

  it("acepta WebP de 5 MB", () => {
    expect(validateMediaFile({ type: "image/webp", size: 5 * 1024 * 1024 })).toBeNull();
  });

  it("rechaza un tipo que coincide con una propiedad heredada", () => {
    expect(validateMediaFile({ type: "constructor", size: 100 }) ?? "").toContain("JPG, PNG o WebP");
    expect(() => mediaPath("p1", "m1", "constructor")).toThrow("JPG, PNG o WebP");
  });
});

describe("mediaPath", () => {
  it("construye la ruta JPG de producto y foto", () => {
    expect(mediaPath("p1", "m1", "image/jpeg")).toBe("product-images/p1/m1.jpg");
  });
});

describe("pickMainPhoto", () => {
  it("elige la foto General de menor orden", () => {
    const media = [
      { colorId: "rojo", sortOrder: 0, name: "roja" },
      { colorId: null, sortOrder: 3, name: "general-3" },
      { colorId: null, sortOrder: 1, name: "general-1" },
    ];
    expect(pickMainPhoto(media, ["rojo"])?.name).toBe("general-1");
  });

  it("sin General elige la primera foto del primer color con fotos", () => {
    const media = [
      { colorId: "azul", sortOrder: 1, name: "azul-1" },
      { colorId: "rojo", sortOrder: 0, name: "rojo-0" },
      { colorId: "azul", sortOrder: 0, name: "azul-0" },
    ];
    expect(pickMainPhoto(media, ["verde", "azul", "rojo"])?.name).toBe("azul-0");
  });

  it("sin fotos devuelve null", () => {
    expect(pickMainPhoto([], ["rojo"])).toBeNull();
  });
});

describe("mediaFileStillUsed", () => {
  it("indica si otra fila todavía usa la ruta", () => {
    expect(mediaFileStillUsed("a.png", ["a.png"])).toBe(true);
    expect(mediaFileStillUsed("a.png", [])).toBe(false);
  });
});
