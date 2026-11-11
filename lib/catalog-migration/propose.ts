/**
 * Propuesta de clasificación: a partir de la foto del catálogo actual y la taxonomía, decide
 * cómo se agrupan los productos (fusiones), qué color y opción lleva cada variante, qué
 * variantes están repetidas y qué atributos/categoría/marca/línea corresponden. La tienda la
 * revisa y corrige en el Excel; nada de esto escribe en la base.
 */
import {
  classifySize,
  extractFromName,
  matchColor,
  normalizeKey,
  type NameParts,
} from "./parse";
import {
  categoryPath,
  findCategory,
  legacyCategoryFor,
  type ColorDef,
  type Taxonomy,
} from "./taxonomy";
import type { CatalogSnapshot, SnapshotProduct, SnapshotVariant } from "./types";

export type ProposedProduct = {
  /** Único en la propuesta. */
  name: string;
  categoryPath: string | null;
  brand: string | null;
  line: string | null;
  /** code → valores */
  attributes: Record<string, string[]>;
  sourceProductIds: string[];
  sourceNames: string[];
  /** true si alguna fuente está activa. */
  active: boolean;
  variantCount: number;
  totalStock: number;
  notes: string[];
};

export type ProposedVariant = {
  sku: string;
  currentProductName: string;
  currentColor: string | null;
  currentSize: string | null;
  stockByBranch: Record<string, number>;
  saleLines: number;
  active: boolean;
  price: number;
  /** = ProposedProduct.name */
  productName: string;
  /** Nombre canónico. */
  color: string | null;
  /** Etiqueta canónica. */
  option: string | null;
  mergeIntoSku: string | null;
  notes: string[];
};

export type Proposal = {
  takenAt: string;
  branches: { id: string; name: string }[];
  products: ProposedProduct[];
  variants: ProposedVariant[];
  /** Canónicas de la taxonomía + actuales que no estén en ella. */
  brands: string[];
  lines: { brand: string; line: string }[];
  colors: ColorDef[];
  /** color canónico → nº de variantes */
  usage: { colors: Record<string, number> };
  unresolved: { colors: string[]; sizes: string[] };
  stats: {
    productsBefore: number;
    productsAfter: number;
    mergedGroups: number;
    duplicateVariants: number;
    missingCategory: number;
    missingBrand: number;
    missingRequiredAttributes: number;
  };
};

type SourceInfo = {
  product: SnapshotProduct;
  parts: NameParts;
  brand: string | null;
  category: string | null;
  variants: SnapshotVariant[];
};

type Group = { key: string; baseKey: string; brand: string | null; sources: SourceInfo[]; name: string };

const totalStock = (v: SnapshotVariant) => Object.values(v.stock).reduce((a, b) => a + b, 0);

export function buildProposal(snapshot: CatalogSnapshot, tax: Taxonomy): Proposal {
  const categoryName = new Map(snapshot.categories.map((c) => [c.id, c.name]));
  const brandName = new Map(snapshot.brands.map((b) => [b.id, b.name]));
  const canonicalBrand = new Map(tax.brands.map((b) => [normalizeKey(b.name), b.name]));
  const variantsByProduct = new Map<string, SnapshotVariant[]>();
  for (const v of snapshot.variants) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }

  // 1. Por producto actual: nombre base, marca y categoría propuestas.
  const sources: SourceInfo[] = snapshot.products.map((product) => {
    const parts = extractFromName(product.name, tax);
    const key = normalizeKey(product.name);
    const current = product.brand_id ? brandName.get(product.brand_id) ?? null : null;
    const brand = current
      ? canonicalBrand.get(normalizeKey(current)) ?? current
      : guessBrand(key, tax);
    const legacy = product.category_id ? categoryName.get(product.category_id) ?? null : null;
    return {
      product,
      parts,
      brand,
      category: proposeCategory(legacy, key, tax),
      variants: variantsByProduct.get(product.id) ?? [],
    };
  });

  // 2. Agrupar por nombre base + marca.
  const groupsByKey = new Map<string, Group>();
  for (const source of sources) {
    const baseKey = normalizeKey(source.parts.baseName);
    const key = `${baseKey}|${normalizeKey(source.brand ?? "")}`;
    const group = groupsByKey.get(key) ?? { key, baseKey, brand: source.brand, sources: [], name: "" };
    group.sources.push(source);
    groupsByKey.set(key, group);
  }
  const groups = [...groupsByKey.values()];

  // 3. Nombre del grupo, único en la propuesta.
  const byBase = new Map<string, Group[]>();
  for (const group of groups) {
    const main = [...group.sources].sort((a, b) => b.variants.length - a.variants.length)[0];
    group.name = main.parts.baseName;
    byBase.set(group.baseKey, [...(byBase.get(group.baseKey) ?? []), group]);
  }
  for (const same of byBase.values()) {
    if (same.length > 1) for (const g of same) if (g.brand) g.name = `${g.name} ${g.brand}`;
  }
  const usedNames = new Map<string, number>();
  for (const group of groups) {
    const k = normalizeKey(group.name);
    const n = (usedNames.get(k) ?? 0) + 1;
    usedNames.set(k, n);
    if (n > 1) group.name = `${group.name} (${n})`;
  }

  const groupOfProduct = new Map<string, Group>();
  for (const g of groups) for (const s of g.sources) groupOfProduct.set(s.product.id, g);

  // 4. Productos propuestos.
  const products: ProposedProduct[] = groups.map((group) => buildProduct(group, tax));

  // 5. Variantes.
  const unresolvedColors = new Set<string>();
  const unresolvedSizes = new Set<string>();
  const variantBySku = new Map<string, SnapshotVariant>();
  const variants: ProposedVariant[] = [];
  for (const source of sources) {
    const group = groupOfProduct.get(source.product.id)!;
    for (const v of source.variants) {
      variantBySku.set(v.sku, v);
      const notes: string[] = [];
      let color: string | null = null;
      if (v.color) {
        color = matchColor(v.color, tax);
        if (!color) {
          notes.push(`Color «${v.color}» sin equivalencia`);
          unresolvedColors.add(v.color);
        }
      }
      let option: string | null = null;
      let sizeColor: string | null = null;
      for (const part of v.size ? classifySize(v.size, source.product.name, tax) : []) {
        if (part.kind === "option") {
          if (!option) option = part.option.label;
          else notes.push(`Revisar: «${part.option.label}» también estaba en talla (se descartó)`);
        } else if (part.kind === "color") {
          if (!sizeColor) sizeColor = part.color;
          else notes.push(`Revisar: «${part.color}» también estaba en talla (se descartó)`);
        } else if (part.kind === "unknown") {
          notes.push(`Revisar: «${part.text}» estaba en talla`);
          unresolvedSizes.add(part.text);
        }
      }
      if (v.color && color && sizeColor && sizeColor !== color) {
        notes.push(`Revisar: la talla dice «${sizeColor}» y el color «${color}»`);
      }
      if (!v.color) color = sizeColor ?? source.parts.color;
      option = option ?? source.parts.option?.label ?? null;
      if (v.price === 0) notes.push("Precio 0");
      variants.push({
        sku: v.sku,
        currentProductName: source.product.name,
        currentColor: v.color,
        currentSize: v.size,
        stockByBranch: v.stock,
        saleLines: v.sale_lines,
        active: v.is_active,
        price: v.price,
        productName: group.name,
        color,
        option,
        mergeIntoSku: null,
        notes,
      });
    }
  }

  // 6. Variantes repetidas dentro de cada producto destino.
  const dupGroups = new Map<string, ProposedVariant[]>();
  for (const pv of variants) {
    const k = `${normalizeKey(pv.productName)}|${normalizeKey(pv.color ?? "")}|${normalizeKey(pv.option ?? "")}`;
    dupGroups.set(k, [...(dupGroups.get(k) ?? []), pv]);
  }
  let duplicateVariants = 0;
  for (const same of dupGroups.values()) {
    if (same.length < 2) continue;
    const ranked = [...same].sort((a, b) => {
      const va = variantBySku.get(a.sku)!;
      const vb = variantBySku.get(b.sku)!;
      return (
        b.saleLines - a.saleLines ||
        totalStock(vb) - totalStock(va) ||
        va.created_at.localeCompare(vb.created_at) ||
        a.sku.localeCompare(b.sku)
      );
    });
    const survivor = ranked[0];
    // Si alguna no se pudo leer bien (color sin equivalencia, texto raro en talla), parecer
    // iguales puede ser sólo falta de datos: se avisa en vez de proponer la fusión.
    const doubtful = same.some((pv) =>
      pv.notes.some((n) => n.startsWith("Color «") || n.startsWith("Revisar:")),
    );
    for (const loser of ranked.slice(1)) {
      if (doubtful) {
        loser.notes.push(`¿Repetida con ${survivor.sku}? revisar`);
        continue;
      }
      loser.mergeIntoSku = survivor.sku;
      if (loser.price !== survivor.price) {
        loser.notes.push(`Precio distinto: $${loser.price} vs $${survivor.price} (${survivor.sku})`);
      }
      duplicateVariants++;
    }
  }

  // 7. Listas y estadísticas.
  const brands = tax.brands.map((b) => b.name);
  const known = new Set(brands.map(normalizeKey));
  for (const b of snapshot.brands) {
    if (!known.has(normalizeKey(b.name))) {
      brands.push(b.name);
      known.add(normalizeKey(b.name));
    }
  }
  const usageColors: Record<string, number> = {};
  for (const pv of variants) if (pv.color) usageColors[pv.color] = (usageColors[pv.color] ?? 0) + 1;

  return {
    takenAt: snapshot.taken_at,
    branches: snapshot.branches.map((b) => ({ id: b.id, name: b.name })),
    products,
    variants,
    brands,
    lines: tax.brands.flatMap((b) => b.lines.map((line) => ({ brand: b.name, line }))),
    colors: tax.colors,
    usage: { colors: usageColors },
    unresolved: {
      colors: [...unresolvedColors].sort((a, b) => a.localeCompare(b)),
      sizes: [...unresolvedSizes].sort((a, b) => a.localeCompare(b)),
    },
    stats: {
      productsBefore: snapshot.products.length,
      productsAfter: products.length,
      mergedGroups: groups.filter((g) => g.sources.length > 1).length,
      duplicateVariants,
      missingCategory: products.filter((p) => !p.categoryPath).length,
      missingBrand: products.filter((p) => !p.brand).length,
      missingRequiredAttributes: products.filter(
        (p) => p.active && p.notes.some((n) => n.endsWith("(obligatorio)")),
      ).length,
    },
  };
}

function guessBrand(nameKey: string, tax: Taxonomy): string | null {
  for (const brand of tax.brands) {
    if (brand.aliases.some((re) => re.test(nameKey))) return brand.name;
  }
  const wm = tax.brands.find((b) => b.name === "World Medics");
  if (wm && wm.lines.some((line) => startsWithWords(nameKey, normalizeKey(line)))) return wm.name;
  return null;
}

function proposeCategory(legacy: string | null, nameKey: string, tax: Taxonomy): string | null {
  if (!legacy || legacy === "Uniformes") {
    for (const rule of [...tax.uniformOverrides, ...tax.nameCategoryRules]) {
      if (rule.pattern.test(nameKey)) return rule.category;
    }
  }
  return legacy ? legacyCategoryFor(tax, legacy) ?? null : null;
}

function startsWithWords(text: string, prefix: string): boolean {
  return text === prefix || text.startsWith(`${prefix} `);
}

function mostFrequent(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  for (const v of values) {
    if (!v) continue;
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (best === null || n > (counts.get(best) ?? 0)) best = v;
  }
  return best;
}

function buildProduct(group: Group, tax: Taxonomy): ProposedProduct {
  const path = mostFrequent(group.sources.map((s) => s.category));
  const category = path ? findCategory(tax, path) : undefined;
  const nameKey = normalizeKey(group.name);
  const notes: string[] = [];

  const brandDef = tax.brands.find((b) => b.name === group.brand);
  const line =
    [...(brandDef?.lines ?? [])]
      .sort((a, b) => b.length - a.length)
      .find((l) => startsWithWords(nameKey, normalizeKey(l))) ?? null;

  const attributes: Record<string, string[]> = {};
  const sourceKeys = group.sources.map((s) => normalizeKey(s.product.name));
  for (const { code, required } of category?.attributes ?? []) {
    const def = tax.attributes.find((a) => a.code === code)!;
    const keywords = tax.attributeKeywords.filter((k) => k.attribute === code);
    let values: string[];
    if (def.isMulti) {
      values = keywords
        .filter((k) => sourceKeys.some((s) => k.pattern.test(s)))
        .map((k) => k.value);
    } else {
      const firstPerSource = sourceKeys
        .map((s) => keywords.find((k) => k.pattern.test(s))?.value)
        .filter((v): v is string => Boolean(v));
      const distinct = [...new Set(firstPerSource)];
      if (distinct.length > 1) {
        notes.push(`Revisar ${def.name}: ${distinct.join("/")}`);
        values = [];
      } else {
        values = distinct;
      }
    }
    attributes[code] = [...new Set(values)];
    if (required && attributes[code].length === 0) notes.push(`Falta ${def.name} (obligatorio)`);
  }

  if (!path) notes.unshift("Falta categoría");
  if (!group.brand) notes.unshift("Falta marca");

  const allVariants = group.sources.flatMap((s) => s.variants);
  return {
    name: group.name,
    categoryPath: category ? categoryPath(category) : path,
    brand: group.brand,
    line,
    attributes,
    sourceProductIds: group.sources.map((s) => s.product.id),
    sourceNames: group.sources.map((s) => s.product.name),
    active: group.sources.some((s) => s.product.is_active),
    variantCount: allVariants.length,
    totalStock: allVariants.reduce((sum, v) => sum + totalStock(v), 0),
    notes,
  };
}
