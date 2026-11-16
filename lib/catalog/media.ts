export const MEDIA_MAX_BYTES = 6 * 1024 * 1024;

const extensionByType = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function validateMediaFile(f: { type: string; size: number }): string | null {
  if (!extensionByType.has(f.type)) return "El archivo debe ser JPG, PNG o WebP.";
  if (f.size > MEDIA_MAX_BYTES) return "El archivo no puede superar 6 MB.";
  return null;
}

export function mediaPath(productId: string, mediaId: string, mimeType: string): string {
  const extension = extensionByType.get(mimeType);
  if (!extension) throw new Error("El archivo debe ser JPG, PNG o WebP.");
  return `product-images/${productId}/${mediaId}.${extension}`;
}

export function orderProductColors(
  variants: { colorId: string | null; isActive: boolean; sku: string }[],
  names: Record<string, string>,
): string[] {
  const activeById = new Map<string, boolean>();
  for (const variant of variants) {
    if (!variant.colorId) continue;
    activeById.set(variant.colorId, (activeById.get(variant.colorId) ?? false) || variant.isActive);
  }
  return [...activeById.keys()].sort((a, b) =>
    Number(activeById.get(b)) - Number(activeById.get(a))
    || (names[a] ?? "").localeCompare(names[b] ?? "", "es", { numeric: true, sensitivity: "base" })
    || a.localeCompare(b),
  );
}

export function pickMainPhoto<T extends { colorId: string | null; sortOrder: number }>(media: T[], colorOrder: string[]): T | null {
  const firstForColor = (colorId: string | null): T | null => {
    let first: T | null = null;
    for (const photo of media) {
      if (photo.colorId === colorId && (first === null || photo.sortOrder < first.sortOrder)) first = photo;
    }
    return first;
  };

  const general = firstForColor(null);
  if (general) return general;

  for (const colorId of colorOrder) {
    const photo = firstForColor(colorId);
    if (photo) return photo;
  }
  return null;
}

export function mediaFileStillUsed(path: string, otherPaths: string[]): boolean {
  return otherPaths.includes(path);
}
