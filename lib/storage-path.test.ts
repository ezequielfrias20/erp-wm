import { describe, it, expect } from "vitest";
import { storagePathFromPublicUrl } from "./storage-path";

describe("storagePathFromPublicUrl", () => {
  it("extrae la ruta después del segmento del bucket", () => {
    expect(
      storagePathFromPublicUrl(
        "https://yxwedegszxtujplffaac.supabase.co/storage/v1/object/public/wm-public/brand/abc-123.png",
        "wm-public",
      ),
    ).toBe("brand/abc-123.png");
  });

  it("descarta el query string", () => {
    expect(
      storagePathFromPublicUrl(
        "https://x.supabase.co/storage/v1/object/public/wm-public/brand/x.png?token=1",
        "wm-public",
      ),
    ).toBe("brand/x.png");
  });

  it("decodifica rutas percent-encoded", () => {
    expect(
      storagePathFromPublicUrl(
        "https://x.supabase.co/storage/v1/object/public/wm-public/brand/a%20b.png",
        "wm-public",
      ),
    ).toBe("brand/a b.png");
  });

  it("devuelve null si no aparece el bucket", () => {
    expect(storagePathFromPublicUrl("https://example.com/logo.png", "wm-public")).toBeNull();
  });
});
