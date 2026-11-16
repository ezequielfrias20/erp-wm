/**
 * Antes de aplicar: qué cambió en el catálogo después de la foto de la revisión, y si la
 * propuesta final cumple el «Criterio de éxito» del spec. Cualquier `Blocker` impide generar
 * el plan de limpieza; el reporte los lista para devolverlos a la tienda.
 */
import type { EditIssue } from "./apply-edits";
import { missingLabels, variantMissing } from "./completeness";
import type { Proposal } from "./propose";
import { findCategory, type Taxonomy } from "./taxonomy";
import type { CatalogSnapshot } from "./types";

type Ref = { id: string; name: string };
type SkuRef = { id: string; sku: string };

export type Drift = {
  newProducts: Ref[];
  changedProducts: Ref[];
  removedProducts: Ref[];
  newVariants: SkuRef[];
  changedVariants: SkuRef[];
  removedVariants: SkuRef[];
};

/** Campos que no cuentan como «cambio del catálogo» (los mueve la operación diaria). */
const VOLATILE = new Set(["stock", "sale_lines", "updated_at"]);

function sameData(a: object, b: object): boolean {
  const strip = (x: object) =>
    JSON.stringify(Object.entries(x).filter(([k]) => !VOLATILE.has(k)).sort(([x1], [x2]) => x1.localeCompare(x2)));
  return strip(a) === strip(b);
}

function diff<T extends { id: string; updated_at: string }, R>(
  before: T[],
  after: T[],
  since: string,
  ref: (x: T) => R,
) {
  const old = new Map(before.map((x) => [x.id, x]));
  const now = new Map(after.map((x) => [x.id, x]));
  return {
    added: after.filter((x) => !old.has(x.id)).map(ref),
    removed: before.filter((x) => !now.has(x.id)).map(ref),
    changed: after
      .filter((x) => old.has(x.id) && (x.updated_at > since || !sameData(old.get(x.id)!, x)))
      .map(ref),
  };
}

export function detectDrift(review: CatalogSnapshot, current: CatalogSnapshot): Drift {
  const products = diff(review.products, current.products, review.taken_at, (p) => ({ id: p.id, name: p.name }));
  const variants = diff(review.variants, current.variants, review.taken_at, (v) => ({ id: v.id, sku: v.sku }));
  return {
    newProducts: products.added,
    changedProducts: products.changed,
    removedProducts: products.removed,
    newVariants: variants.added,
    changedVariants: variants.changed,
    removedVariants: variants.removed,
  };
}

export type Blocker = {
  kind: "product" | "variant" | "merge" | "duplicate" | "edit";
  /** Producto, SKU o celda del Excel. */
  ref: string;
  message: string;
};

const OPTION_LABEL = { talla: "Talla", amarre: "Amarre" } as const;

export function validateForApply(p: Proposal, tax: Taxonomy, issues: EditIssue[]): Blocker[] {
  const blockers: Blocker[] = issues.map((i) => ({
    kind: "edit",
    ref: `${i.file} · ${i.sheet} fila ${i.row} · ${i.column}`,
    message: i.message,
  }));

  // ── Productos
  const productByName = new Map(p.products.map((x) => [x.name, x]));
  for (const prod of p.products) {
    if (!prod.active) continue;
    const missing = missingLabels(prod, tax);
    if (missing.length) blockers.push({ kind: "product", ref: prod.name, message: `Falta ${missing.join(", ")}` });
  }

  // ── Variantes
  const bySku = new Map(p.variants.map((v) => [v.sku, v]));
  for (const v of p.variants) {
    const prod = productByName.get(v.productName);
    const category = prod?.categoryPath ? findCategory(tax, prod.categoryPath) : undefined;
    const optionLabel = category?.optionType ? OPTION_LABEL[category.optionType] : "opción";
    const missing = variantMissing(v, prod, tax);
    if (missing.length) {
      const names = missing.map((m) => (m === "color" ? "color" : optionLabel));
      blockers.push({ kind: "variant", ref: v.sku, message: `Falta ${names.join(" y ")} (${v.productName})` });
    }
    if (v.active && !v.mergeIntoSku && prod?.active && category?.optionType && v.option) {
      if (!tax.optionValues[category.optionType].includes(v.option)) {
        blockers.push({
          kind: "variant",
          ref: v.sku,
          message: `«${v.option}» no es un valor de ${optionLabel} (${v.productName})`,
        });
      }
    }

    if (v.mergeIntoSku) {
      const target = bySku.get(v.mergeIntoSku);
      const problem = !target
        ? `fusiona con «${v.mergeIntoSku}», que no existe`
        : target.mergeIntoSku
          ? `fusiona con ${target.sku}, que a su vez se fusiona con ${target.mergeIntoSku}`
          : target.productName !== v.productName
            ? `fusiona con ${target.sku}, que es de otro producto (${target.productName})`
            : target.color !== v.color || target.option !== v.option
              ? `fusiona con ${target.sku}, que tiene otro color u opción`
              : null;
      if (problem) blockers.push({ kind: "merge", ref: v.sku, message: problem });
    }
  }

  // ── Repetidas: misma clave (producto, color, opción) entre las que quedan; null cuenta.
  const groups = new Map<string, string[]>();
  for (const v of p.variants) {
    if (v.mergeIntoSku) continue;
    const key = JSON.stringify([v.productName, v.color, v.option]);
    groups.set(key, [...(groups.get(key) ?? []), v.sku]);
  }
  for (const [key, skus] of groups) {
    if (skus.length < 2) continue;
    const [product, color, option] = JSON.parse(key) as [string, string | null, string | null];
    blockers.push({
      kind: "duplicate",
      ref: product,
      message: `Variantes repetidas (${color ?? "sin color"} / ${option ?? "sin opción"}): ${skus.join(", ")}`,
    });
  }
  return blockers;
}
