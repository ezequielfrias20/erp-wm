const PRODUCT_IMAGE_BUCKET = "wm-public";
const PRODUCT_IMAGE_PREFIX = "product-images";

export const PRODUCT_IMAGE_MAX_SIZE = 4 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function productImagePath(productId: string) {
  return `${PRODUCT_IMAGE_PREFIX}/${productId}.png`;
}

export function productImageUrl(
  productId: string | null | undefined,
  version?: string | number | null,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !productId) return null;

  const url = `${supabaseUrl}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${productImagePath(productId)}`;
  return version ? `${url}?v=${encodeURIComponent(String(version))}` : url;
}
