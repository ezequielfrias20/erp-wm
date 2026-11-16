/**
 * Plan de limpieza: traduce la propuesta final (ya validada, sin bloqueantes) a ids reales de
 * la foto para que `scripts/catalogo/aplicar.sql` lo ejecute por conjuntos. Aquí se deciden el
 * producto sobreviviente de cada grupo, los slugs, qué filas de maestros se reutilizan y a qué
 * color va cada foto. El SQL no decide nada: sólo aplica este JSON.
 */
import { normalizeKey } from "./parse";
import type { Proposal } from "./propose";
import { findCategory, type OptionTypeCode, type Taxonomy } from "./taxonomy";
import type { CatalogSnapshot, SnapshotProduct } from "./types";

export function slugify(text: string): string {
  const slug = normalizeKey(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "x";
}

export type CleanupPlan = {
  runId: string;
  snapshotTakenAt: string;
  guard: { products: number; variants: number; maxUpdatedAt: string };
  departments: { name: string; slug: string; sortOrder: number; reuseId: string | null }[];
  categories: {
    name: string;
    slug: string;
    department: string;
    sortOrder: number;
    reuseId: string | null;
    optionType: OptionTypeCode | null;
    requiresColor: boolean;
    attributes: { code: string; required: boolean; sortOrder: number }[];
  }[];
  legacyCategoryIds: string[];
  attributes: {
    code: string;
    name: string;
    isMulti: boolean;
    sortOrder: number;
    values: { name: string; slug: string; sortOrder: number }[];
  }[];
  optionValues: { type: OptionTypeCode; label: string; slug: string; sortOrder: number }[];
  brands: { name: string; slug: string; reuseId: string | null }[];
  lines: { brand: string; name: string; slug: string; sortOrder: number }[];
  colors: { name: string; slug: string; hex: string; family: string; sortOrder: number; reuseId: string | null }[];
  legacyColorIds: string[];
  products: {
    id: string;
    mergeIds: string[];
    name: string;
    slug: string;
    /** Nombre de la categoría de 2.º nivel (null sólo en inactivos sin clasificar). */
    category: string | null;
    brand: string | null;
    line: string | null;
    isActive: boolean;
    attributes: { code: string; value: string }[];
  }[];
  variants: {
    id: string;
    sku: string;
    productId: string;
    color: string | null;
    option: { type: OptionTypeCode; label: string } | null;
    isActive: boolean;
    mergeIntoId: string | null;
  }[];
  media: { productId: string; color: string | null; path: string; sortOrder: number }[];
};

/** Reutiliza filas existentes por nombre (exacto primero, luego sin mayúsculas ni acentos). */
class Reuse {
  private used = new Set<string>();
  constructor(private rows: { id: string; name: string }[]) {}
  take(...names: string[]): string | null {
    for (const exact of [true, false]) {
      for (const name of names) {
        const row = this.rows.find(
          (r) => !this.used.has(r.id) && (exact ? r.name === name : normalizeKey(r.name) === normalizeKey(name)),
        );
        if (row) {
          this.used.add(row.id);
          return row.id;
        }
      }
    }
    return null;
  }
  unused(): string[] {
    return this.rows.filter((r) => !this.used.has(r.id)).map((r) => r.id);
  }
}

export function buildCleanupPlan(s: CatalogSnapshot, p: Proposal, tax: Taxonomy, runId: string): CleanupPlan {
  // ── Maestros
  const categoryRows = new Reuse(s.categories);
  const departments = tax.departments.map((name, i) => ({
    name,
    slug: slugify(name),
    sortOrder: i + 1,
    reuseId: categoryRows.take(name),
  }));
  const categories = tax.categories.map((c) => ({
    name: c.name,
    slug: slugify(c.name),
    department: c.department,
    sortOrder: tax.categories.filter((x) => x.department === c.department).indexOf(c) + 1,
    reuseId: categoryRows.take(c.name),
    optionType: c.optionType,
    requiresColor: c.requiresColor,
    attributes: c.attributes.map((a, i) => ({ code: a.code, required: a.required, sortOrder: i + 1 })),
  }));

  const brandRows = new Reuse(s.brands);
  const brands = p.brands.map((name) => ({ name, slug: slugify(name), reuseId: brandRows.take(name) }));

  const colorRows = new Reuse(s.colors);
  // Primero todos por nombre exacto, para que «Mostaza» no le gane la fila a otro canónico.
  const exactIds = new Map(tax.colors.map((c) => [c.name, colorRows.take(c.name)] as const));
  const colors = tax.colors.map((c, i) => ({
    name: c.name,
    slug: slugify(c.name),
    hex: c.hex,
    family: c.family,
    sortOrder: i + 1,
    reuseId: exactIds.get(c.name) ?? colorRows.take(...c.aliases),
  }));

  // ── Productos
  const sourceById = new Map(s.products.map((x) => [x.id, x]));
  const variantsBySource = new Map<string, CatalogSnapshot["variants"]>();
  for (const v of s.variants) variantsBySource.set(v.product_id, [...(variantsBySource.get(v.product_id) ?? []), v]);
  const salesOf = (x: SnapshotProduct) => (variantsBySource.get(x.id) ?? []).reduce((n, v) => n + v.sale_lines, 0);
  const stockOf = (x: SnapshotProduct) =>
    (variantsBySource.get(x.id) ?? []).reduce((n, v) => n + Object.values(v.stock).reduce((a, b) => a + b, 0), 0);

  const usedSlugs = new Set<string>();
  const uniqueSlug = (name: string) => {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedSlugs.add(slug);
    return slug;
  };

  const survivorOf = new Map<string, string>();
  const finalColorBySku = new Map(p.variants.map((v) => [v.sku, v.color]));
  const media: CleanupPlan["media"] = [];
  const products = p.products.map((prod) => {
    const sources = prod.sourceProductIds
      .map((id) => sourceById.get(id)!)
      .sort(
        (a, b) =>
          salesOf(b) - salesOf(a) ||
          stockOf(b) - stockOf(a) ||
          a.created_at.localeCompare(b.created_at) ||
          a.id.localeCompare(b.id),
      );
    const [survivor, ...merged] = sources;
    survivorOf.set(prod.name, survivor.id);

    sources
      .filter((src) => src.has_image)
      .forEach((src, i) => {
        const srcColors = new Set((variantsBySource.get(src.id) ?? []).map((v) => finalColorBySku.get(v.sku) ?? null));
        const color = sources.length > 1 && srcColors.size === 1 ? [...srcColors][0] : null;
        media.push({ productId: survivor.id, color, path: `product-images/${src.id}.png`, sortOrder: i });
      });

    const category = prod.categoryPath ? findCategory(tax, prod.categoryPath) : undefined;
    return {
      id: survivor.id,
      mergeIds: merged.map((x) => x.id),
      name: prod.name,
      slug: uniqueSlug(prod.name),
      category: category?.name ?? null,
      brand: prod.brand,
      line: prod.line,
      isActive: prod.active,
      attributes: (category?.attributes ?? []).flatMap(({ code }) =>
        (prod.attributes[code] ?? []).map((value) => ({ code, value })),
      ),
    };
  });

  // ── Variantes
  const idBySku = new Map(s.variants.map((v) => [v.sku, v.id]));
  const productByName = new Map(p.products.map((x) => [x.name, x]));
  const optionTypeOf = (label: string, preferred: OptionTypeCode | null): OptionTypeCode => {
    if (preferred && tax.optionValues[preferred].includes(label)) return preferred;
    return (Object.keys(tax.optionValues) as OptionTypeCode[]).find((t) => tax.optionValues[t].includes(label))!;
  };
  const variants = p.variants.map((v) => {
    const prod = productByName.get(v.productName)!;
    const category = prod.categoryPath ? findCategory(tax, prod.categoryPath) : undefined;
    return {
      id: idBySku.get(v.sku)!,
      sku: v.sku,
      productId: survivorOf.get(v.productName)!,
      color: v.color,
      option: v.option ? { type: optionTypeOf(v.option, category?.optionType ?? null), label: v.option } : null,
      isActive: v.active,
      mergeIntoId: v.mergeIntoSku ? idBySku.get(v.mergeIntoSku)! : null,
    };
  });

  const lineOrder = new Map<string, number>();
  const lines = p.lines.map((l) => {
    const n = (lineOrder.get(l.brand) ?? 0) + 1;
    lineOrder.set(l.brand, n);
    return { brand: l.brand, name: l.line, slug: slugify(l.line), sortOrder: n };
  });

  const updated = [...s.products, ...s.variants].map((x) => x.updated_at).sort();
  return {
    runId,
    snapshotTakenAt: s.taken_at,
    guard: { products: s.products.length, variants: s.variants.length, maxUpdatedAt: updated.at(-1) ?? "" },
    departments,
    categories,
    legacyCategoryIds: categoryRows.unused(),
    attributes: tax.attributes.map((a, i) => ({
      code: a.code,
      name: a.name,
      isMulti: a.isMulti,
      sortOrder: i + 1,
      values: a.values.map((name, j) => ({ name, slug: slugify(name), sortOrder: j + 1 })),
    })),
    optionValues: (Object.keys(tax.optionValues) as OptionTypeCode[]).flatMap((type) =>
      tax.optionValues[type].map((label, i) => ({ type, label, slug: slugify(label), sortOrder: i + 1 })),
    ),
    brands,
    lines,
    colors,
    legacyColorIds: colorRows.unused(),
    products,
    variants,
    media,
  };
}
