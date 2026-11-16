/**
 * Aplica sobre la propuesta automática lo que la tienda corrigió en uno o más Excel devueltos.
 * Todo valor escrito se compara sin mayúsculas, acentos ni espacios y se guarda en su forma
 * canónica. Lo que no existe en las listas no se inventa: queda como `EditIssue` (con archivo,
 * hoja, fila y columna) y el campo conserva el valor anterior.
 *
 * Regla de las filas (ver ledger del plan 2): cada fila viene prellenada, así que es la verdad
 * completa del producto o variante. Una celda vacía deja el campo vacío.
 */
import { missingLabels } from "./completeness";
import { normalizeKey } from "./parse";
import type { Proposal, ProposedProduct } from "./propose";
import type { ProductEdit, ReviewEdits, VariantEdit } from "./read-review";
import { categoryPath, type Taxonomy } from "./taxonomy";
import { SHEETS, taxonomyHash } from "./workbook-schema";

export type EditIssue = { file: string; sheet: string; row: number; column: string; message: string };

/** Índice por clave normalizada → valor canónico. */
class Index {
  private map = new Map<string, string>();
  constructor(values: Iterable<string> = []) {
    for (const v of values) this.add(v);
  }
  add(value: string, ...aliases: string[]) {
    for (const k of [value, ...aliases]) {
      const key = normalizeKey(k);
      if (key && !this.map.has(key)) this.map.set(key, value);
    }
  }
  get(text: string): string | undefined {
    return this.map.get(normalizeKey(text));
  }
}

const COL = {
  name: "Producto (nombre nuevo)",
  category: "Departamento › Categoría",
  brand: "Marca",
  line: "Línea / modelo",
  color: "Color",
  option: "Talla / opción",
  mergeInto: "Fusionar con SKU",
  sku: "SKU",
  proposedName: "Nombre propuesto",
} as const;

export function applyEdits(
  input: Proposal,
  inputTax: Taxonomy,
  edits: ReviewEdits[],
): { proposal: Proposal; tax: Taxonomy; issues: EditIssue[] } {
  const proposal = structuredClone(input);
  const tax = structuredClone(inputTax);
  const issues: EditIssue[] = [];
  /** nombre viejo → nombre nuevo (encadenable entre archivos). */
  const renamed = new Map<string, string>();
  const expectedHash = taxonomyHash(inputTax);

  for (const file of edits) {
    const issue = (sheet: string, row: number, column: string, message: string) =>
      issues.push({ file: file.file, sheet, row, column, message });

    // Un archivo hecho con otra taxonomía puede traer categorías, columnas o valores que ya no
    // significan lo mismo: no se aplica nada de él. (La fecha de la foto sí difiere a propósito:
    // eso lo cubren detectDrift y la guarda del SQL.)
    if (file.taxonomyHash !== expectedHash) {
      issue(SHEETS.info, 4, "taxonomy_hash", "El archivo se generó con otra versión de la taxonomía: vuelve a generarlo");
      continue;
    }

    applyMasters(file, proposal, tax, issue);

    // ── Índices (después de los maestros del archivo)
    const categories = new Index(tax.categories.map(categoryPath));
    const brands = new Index(proposal.brands);
    const colors = new Index();
    for (const c of tax.colors) colors.add(c.name, ...c.aliases);
    const options = new Index(Object.values(tax.optionValues).flat());
    for (const [alias, label] of Object.entries(tax.optionAliases)) options.add(label, alias);
    const attrValues = new Map(tax.attributes.map((a) => [a.code, new Index(a.values)]));
    const attrName = new Map(tax.attributes.map((a) => [a.code, a.name]));
    const linesOf = (brand: string | null) =>
      new Index(proposal.lines.filter((l) => l.brand === brand).map((l) => l.line));

    // ── Productos
    for (const e of file.products) {
      const resolveName = (n: string) => {
        let name = n;
        while (renamed.has(name)) name = renamed.get(name)!;
        return name;
      };
      if (!e.proposedName) {
        issue(SHEETS.products, e.row, COL.proposedName, `Producto nuevo «${e.name}»: no soportado en esta ronda`);
        continue;
      }
      const product = proposal.products.find((p) => p.name === resolveName(e.proposedName));
      if (!product) {
        issue(SHEETS.products, e.row, COL.proposedName, `«${e.proposedName}» ya no existe en el catálogo`);
        continue;
      }
      applyProductEdit(e, product, {
        issue: (column, message) => issue(SHEETS.products, e.row, column, message),
        categories,
        brands,
        linesOf,
        attrValues,
        attrName,
        nameTaken: (name) => proposal.products.some((p) => p !== product && p.name === name),
        rename: (from, to) => {
          renamed.set(from, to);
          for (const v of proposal.variants) if (v.productName === from) v.productName = to;
        },
      });
    }

    // ── Variantes
    const productNames = () => new Set(proposal.products.map((p) => p.name));
    for (const e of file.variants) {
      const variant = proposal.variants.find((v) => v.sku === e.sku);
      if (!variant) {
        issue(SHEETS.variants, e.row, COL.sku, `SKU «${e.sku}» ya no existe en el catálogo`);
        continue;
      }
      applyVariantEdit(e, variant, {
        issue: (column, message) => issue(SHEETS.variants, e.row, column, message),
        resolveProduct: (n) => {
          let name = n;
          while (renamed.has(name)) name = renamed.get(name)!;
          return productNames().has(name) ? name : undefined;
        },
        colors,
        options,
        skus: new Set(proposal.variants.map((v) => v.sku)),
      });
    }
  }

  // Notas «Falta …» recalculadas sobre el resultado final.
  for (const p of proposal.products) {
    p.notes = [...p.notes.filter((n) => !n.startsWith("Falta")), ...missingLabels(p, tax).map((l) => `Falta ${l}`)];
  }
  return { proposal, tax, issues };
}

/** Marcas, líneas, colores y valores agregados o renombrados en el archivo. */
function applyMasters(
  file: ReviewEdits,
  proposal: Proposal,
  tax: Taxonomy,
  issue: (sheet: string, row: number, column: string, message: string) => void,
) {
  const sameKey = (a: string, b: string) => normalizeKey(a) === normalizeKey(b);
  for (const b of file.brands) {
    if (b.original && b.original !== b.name) {
      if (!proposal.brands.includes(b.original)) {
        issue(SHEETS.brands, b.row, "Marca", `La marca original «${b.original}» no existe`);
        continue;
      }
      if (proposal.brands.some((x) => x !== b.original && sameKey(x, b.name))) {
        issue(SHEETS.brands, b.row, "Marca", `Ya existe la marca «${b.name}»: renombrar no fusiona marcas`);
        continue;
      }
      proposal.brands = proposal.brands.map((x) => (x === b.original ? b.name : x));
      for (const def of tax.brands) if (def.name === b.original) def.name = b.name;
      for (const p of proposal.products) if (p.brand === b.original) p.brand = b.name;
      for (const l of proposal.lines) if (l.brand === b.original) l.brand = b.name;
    } else if (!new Index(proposal.brands).get(b.name)) {
      proposal.brands.push(b.name);
      tax.brands.push({ name: b.name, aliases: [], lines: [] });
    }
  }
  const brandIndex = new Index(proposal.brands);
  for (const l of file.lines) {
    const brand = brandIndex.get(l.brand);
    if (!brand) continue; // una línea sin marca válida no se puede usar; se reporta al usarla
    const exists = proposal.lines.some((x) => x.brand === brand && normalizeKey(x.line) === normalizeKey(l.line));
    if (!exists) proposal.lines.push({ brand, line: l.line });
  }
  for (const c of file.colors) {
    const hexOk = !c.hex || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c.hex);
    const family = c.family ? tax.colorFamilies.find((f) => sameKey(f, c.family)) : "";
    if (!hexOk) issue(SHEETS.colors, c.row, "Hex", `«${c.hex}» no es un color hex (#RRGGBB)`);
    if (family === undefined) issue(SHEETS.colors, c.row, "Familia", `«${c.family}» no es una familia de color`);
    if (!hexOk || family === undefined) continue;
    const existing = tax.colors.find((x) => x.name === (c.original ?? c.name));
    if (c.original && !existing) {
      issue(SHEETS.colors, c.row, "Color", `El color original «${c.original}» no existe`);
      continue;
    }
    if (existing) {
      if (c.original && c.original !== c.name) {
        if (tax.colors.some((x) => x !== existing && sameKey(x.name, c.name))) {
          issue(SHEETS.colors, c.row, "Color", `Ya existe el color «${c.name}»: renombrar no fusiona colores`);
          continue;
        }
        existing.aliases.push(existing.name);
        existing.name = c.name;
        for (const v of proposal.variants) if (v.color === c.original) v.color = c.name;
      }
      if (c.hex) existing.hex = c.hex;
      if (family) existing.family = family;
    } else if (!tax.colors.some((x) => sameKey(x.name, c.name))) {
      if (!c.hex || !family) {
        issue(SHEETS.colors, c.row, c.hex ? "Familia" : "Hex", `El color nuevo «${c.name}» necesita hex y familia`);
        continue;
      }
      tax.colors.push({ name: c.name, hex: c.hex, family, aliases: [] });
    }
  }
  proposal.colors = tax.colors;
  for (const a of tax.attributes) {
    const index = new Index(a.values);
    for (const v of file.values[a.code] ?? []) {
      if (!index.get(v)) {
        a.values.push(v);
        index.add(v);
      }
    }
  }
}

type ProductContext = {
  issue: (column: string, message: string) => void;
  categories: Index;
  brands: Index;
  linesOf: (brand: string | null) => Index;
  attrValues: Map<string, Index>;
  attrName: Map<string, string>;
  nameTaken: (name: string) => boolean;
  rename: (from: string, to: string) => void;
};

function applyProductEdit(e: ProductEdit, product: ProposedProduct, ctx: ProductContext) {
  /** Celda vacía → null; valor de la lista → canónico; otro → issue y se conserva el anterior. */
  const pick = (value: string, index: Index, column: string, current: string | null) => {
    if (!value) return null;
    const found = index.get(value);
    if (found) return found;
    ctx.issue(column, `«${value}» no está en la lista de ${column}`);
    return current;
  };

  product.categoryPath = pick(e.category, ctx.categories, COL.category, product.categoryPath);
  product.brand = pick(e.brand, ctx.brands, COL.brand, product.brand);
  product.line = pick(e.line, ctx.linesOf(product.brand), COL.line, product.line);
  product.active = e.active;

  const attributes: Record<string, string[]> = {};
  for (const [code, index] of ctx.attrValues) {
    attributes[code] = [];
    for (const value of e.attributes[code] ?? []) {
      const found = index.get(value);
      if (found) attributes[code].push(found);
      else {
        ctx.issue(ctx.attrName.get(code)!, `«${value}» no está en la lista de ${ctx.attrName.get(code)}`);
        attributes[code].push(...(product.attributes[code] ?? []).filter((v) => !attributes[code].includes(v)));
      }
    }
    attributes[code] = [...new Set(attributes[code])];
  }
  product.attributes = attributes;

  if (e.name && e.name !== product.name) {
    if (ctx.nameTaken(e.name)) ctx.issue(COL.name, `Ya hay otro producto llamado «${e.name}»`);
    else {
      const from = product.name;
      product.name = e.name;
      ctx.rename(from, e.name);
    }
  }
}

type VariantContext = {
  issue: (column: string, message: string) => void;
  resolveProduct: (name: string) => string | undefined;
  colors: Index;
  options: Index;
  skus: Set<string>;
};

function applyVariantEdit(e: VariantEdit, variant: Proposal["variants"][number], ctx: VariantContext) {
  if (!e.product) ctx.issue(COL.name, "La variante no tiene producto");
  else {
    const product = ctx.resolveProduct(e.product);
    if (product) variant.productName = product;
    else ctx.issue(COL.name, `El producto «${e.product}» no existe`);
  }

  if (!e.color) variant.color = null;
  else {
    const color = ctx.colors.get(e.color);
    if (color) variant.color = color;
    else ctx.issue(COL.color, `«${e.color}» no está en la lista de colores`);
  }

  if (!e.option) variant.option = null;
  else {
    const option = ctx.options.get(e.option);
    if (option) variant.option = option;
    else ctx.issue(COL.option, `«${e.option}» no es una talla ni una opción conocida`);
  }

  if (!e.mergeInto) variant.mergeIntoSku = null;
  else if (ctx.skus.has(e.mergeInto)) variant.mergeIntoSku = e.mergeInto;
  else ctx.issue(COL.mergeInto, `El SKU «${e.mergeInto}» no existe`);

  variant.active = e.active;
}
