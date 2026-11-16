const normalizeSku = (sku: string): string => sku.trim().toUpperCase();

function normalizedSkuIndex(variantBySku: Map<string, string>, variantByAlias: Map<string, string>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [sku, variantId] of variantByAlias) index.set(normalizeSku(sku), variantId);
  for (const [sku, variantId] of variantBySku) index.set(normalizeSku(sku), variantId);
  return index;
}

export function resolveSku(sku: string, variantBySku: Map<string, string>, variantByAlias: Map<string, string>): string | null {
  return normalizedSkuIndex(variantBySku, variantByAlias).get(normalizeSku(sku)) ?? null;
}

export function resolveImportSkus(
  rows: { row: number; sku: string; branch: string }[],
  variantBySku: Map<string, string>,
  variantByAlias: Map<string, string>,
): { resolved: { row: number; variantId: string }[]; conflicts: { rows: number[]; variantId: string }[]; unknown: number[] } {
  const index = normalizedSkuIndex(variantBySku, variantByAlias);
  const groups = new Map<string, { rows: number[]; variantId: string }>();
  const unknown: number[] = [];

  for (const row of rows) {
    const variantId = index.get(normalizeSku(row.sku));
    if (!variantId) {
      unknown.push(row.row);
      continue;
    }
    // La importación compara sucursales sin mayúsculas ni espacios: el conflicto también.
    const groupKey = JSON.stringify([row.branch.trim().toLowerCase(), variantId]);
    const group = groups.get(groupKey);
    if (group) group.rows.push(row.row);
    else groups.set(groupKey, { rows: [row.row], variantId });
  }

  const resolved: { row: number; variantId: string }[] = [];
  const conflicts: { rows: number[]; variantId: string }[] = [];
  for (const group of groups.values()) {
    if (group.rows.length > 1) conflicts.push(group);
    else resolved.push({ row: group.rows[0], variantId: group.variantId });
  }

  return { resolved, conflicts, unknown };
}
