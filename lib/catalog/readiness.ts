export type ReadinessInput = {
  isActive: boolean;
  description: string | null;
  brandId: string | null;
  category: { id: string; parentId: string | null; requiresColor: boolean; optionTypeId: string | null } | null;
  requiredAttributeIds: string[];
  attributeIdsWithValue: string[];
  variants: {
    id: string;
    sku: string;
    isActive: boolean;
    price: number;
    colorId: string | null;
    optionValueId: string | null;
    optionTypeId: string | null;
  }[];
  media: { colorId: string | null }[];
};

export type Missing =
  | { kind: "category" }
  | { kind: "brand" }
  | { kind: "description" }
  | { kind: "attribute"; attributeId: string }
  | { kind: "photo"; colorId: string | null }
  | { kind: "price"; sku: string }
  | { kind: "variantColor"; sku: string }
  | { kind: "variantOption"; sku: string };

export function productReadiness(i: ReadinessInput): { ready: boolean; missing: Missing[] } {
  if (!i.isActive) return { ready: true, missing: [] };

  const missing: Missing[] = [];
  const category = i.category?.parentId != null ? i.category : null;

  if (!category) missing.push({ kind: "category" });
  if (!i.brandId) missing.push({ kind: "brand" });
  if (!i.description?.trim()) missing.push({ kind: "description" });

  if (category) {
    const attributesWithValue = new Set(i.attributeIdsWithValue);
    for (const attributeId of new Set(i.requiredAttributeIds)) {
      if (!attributesWithValue.has(attributeId)) missing.push({ kind: "attribute", attributeId });
    }
  }

  const activeVariants = i.variants.filter((variant) => variant.isActive);
  const colorIds = [...new Set(activeVariants.map((variant) => variant.colorId).filter((id): id is string => id !== null))];
  const photographedColors = new Set(i.media.map((photo) => photo.colorId));

  for (const colorId of colorIds) {
    if (!photographedColors.has(colorId) && !(colorIds.length === 1 && photographedColors.has(null))) {
      missing.push({ kind: "photo", colorId });
    }
  }

  if (colorIds.length === 0 && activeVariants.length > 0 && i.media.length === 0) {
    missing.push({ kind: "photo", colorId: null });
  }

  for (const variant of activeVariants) {
    if (variant.price <= 0) missing.push({ kind: "price", sku: variant.sku });
    if (category?.requiresColor && variant.colorId === null) {
      missing.push({ kind: "variantColor", sku: variant.sku });
    }
    if (category?.optionTypeId && (variant.optionValueId === null || variant.optionTypeId !== category.optionTypeId)) {
      missing.push({ kind: "variantOption", sku: variant.sku });
    }
  }

  return { ready: missing.length === 0, missing };
}
