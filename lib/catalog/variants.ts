export function variantKey(colorId: string | null, optionValueId: string | null): string {
  return JSON.stringify([colorId, optionValueId]);
}

export function variantMastersChanged(
  current: { colorId: string | null; optionValueId: string | null } | null,
  next: { colorId: string | null; optionValueId: string | null },
): boolean {
  return current === null || current.colorId !== next.colorId || current.optionValueId !== next.optionValueId;
}

export function findDuplicate<T extends { id: string; colorId: string | null; optionValueId: string | null }>(
  existing: T[],
  candidate: { id?: string; colorId: string | null; optionValueId: string | null },
): T | null {
  const key = variantKey(candidate.colorId, candidate.optionValueId);
  return existing.find((variant) => variant.id !== candidate.id && variantKey(variant.colorId, variant.optionValueId) === key) ?? null;
}

export function missingCombinations(
  existing: { colorId: string | null; optionValueId: string | null }[],
  colorIds: (string | null)[],
  optionValueIds: (string | null)[],
): { colorId: string | null; optionValueId: string | null }[] {
  const seen = new Set(existing.map((variant) => variantKey(variant.colorId, variant.optionValueId)));
  const missing: { colorId: string | null; optionValueId: string | null }[] = [];
  for (const colorId of colorIds) {
    for (const optionValueId of optionValueIds) {
      const key = variantKey(colorId, optionValueId);
      if (seen.has(key)) continue;
      seen.add(key);
      missing.push({ colorId, optionValueId });
    }
  }
  return missing;
}

export function legacyText(
  color: { name: string; hex: string | null } | null,
  option: { label: string } | null,
): { color: string | null; color_hex: string | null; size: string | null } {
  return { color: color?.name ?? null, color_hex: color?.hex ?? null, size: option?.label ?? null };
}

export type DeleteBlocker = "sales" | "purchases" | "stock" | "aliases";

export function variantDeleteBlockers(s: { saleLines: number; purchaseLines: number; stock: number; aliases: number }): DeleteBlocker[] {
  const blockers: DeleteBlocker[] = [];
  if (s.saleLines > 0) blockers.push("sales");
  if (s.purchaseLines > 0) blockers.push("purchases");
  if (s.stock > 0) blockers.push("stock");
  if (s.aliases > 0) blockers.push("aliases");
  return blockers;
}
