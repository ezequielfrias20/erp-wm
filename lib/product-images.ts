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
