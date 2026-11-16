import { MEDIA_MAX_BYTES } from "@/lib/catalog/media";

const PRODUCT_IMAGE_BUCKET = "wm-public";
const PRODUCT_IMAGE_PREFIX = "product-images";

export const PRODUCT_IMAGE_MAX_SIZE = MEDIA_MAX_BYTES;
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

export function mediaPublicUrl(
  path: string,
  version?: string | number | null,
): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !path) return null;

  const url = `${supabaseUrl}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${path}`;
  return version ? `${url}?v=${encodeURIComponent(String(version))}` : url;
}
