import type { ProductMedia, ProductVariant } from "@/lib/database.types";

const PRODUCT_IMAGE_BUCKET = "wm-public";
const PRODUCT_IMAGE_PREFIX = "product-images";

/** Segmento de ruta permitido: sin «/», «?», «#», «%» ni espacios. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function isProductImagePath(path: string): boolean {
  const segments = path.split("/");
  return segments[0] === PRODUCT_IMAGE_PREFIX &&
    segments.length >= 2 &&
    segments.every((segment) => segment !== "." && segment !== ".." && SAFE_SEGMENT.test(segment));
}

/**
 * URL pública de una foto de `product_media`. Sólo acepta rutas bajo `product-images/` con
 * segmentos simples (las que genera `mediaPath` y las viejas `<id>.png`); cualquier otra → null.
 */
export function mediaPublicUrl(
  path: string,
  version?: string | number | null,
): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !isProductImagePath(path)) return null;

  const url = `${supabaseUrl}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${path}`;
  return version ? `${url}?v=${encodeURIComponent(String(version))}` : url;
}

/** Fotos por variante: sólo del mismo producto y color, sin heredar otros colores. */
export function buildVariantPhotoUrls(
  variants: Pick<ProductVariant, "id" | "product_id" | "color_id">[],
  media: Pick<ProductMedia, "id" | "product_id" | "color_id" | "path" | "sort_order">[],
): Map<string, string> {
  const photosByProduct = new Map<string, Map<string | null, (typeof media)[number]>>();
  for (const photo of media) {
    const byColor = photosByProduct.get(photo.product_id) ?? new Map();
    const first = byColor.get(photo.color_id);
    if (!first || photo.sort_order < first.sort_order
      || (photo.sort_order === first.sort_order && photo.id < first.id)) {
      byColor.set(photo.color_id, photo);
    }
    photosByProduct.set(photo.product_id, byColor);
  }

  const urls = new Map<string, string>();
  for (const variant of variants) {
    const photo = photosByProduct.get(variant.product_id)?.get(variant.color_id);
    const url = photo ? mediaPublicUrl(photo.path) : null;
    if (url) urls.set(variant.id, url);
  }
  return urls;
}
