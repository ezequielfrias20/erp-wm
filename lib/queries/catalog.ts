import "server-only";

import { orderProductColors, pickMainPhoto } from "@/lib/catalog/media";
import { productReadiness, type Readiness, type ReadinessInput } from "@/lib/catalog/readiness";
import type {
  AttributeRow,
  AttributeValue,
  Brand,
  Branch,
  Category,
  CategoryAttribute,
  ColorFamily,
  ColorRow,
  Inventory,
  OptionType,
  OptionValue,
  Product,
  ProductAttributeValue,
  ProductLine,
  ProductMedia,
  ProductVariant,
  PurchaseOrderItem,
  SaleItem,
  VariantSkuAlias,
} from "@/lib/database.types";
import { mediaPublicUrl } from "@/lib/product-images";
import { cachedFor, invalidateCache, CACHE_TTL } from "@/lib/server-cache";
import { chunk, inChunks } from "@/lib/chunk";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { createClient } from "@/lib/supabase/server";

export type CatalogMasters = {
  departments: { id: string; name: string }[];
  categories: {
    id: string;
    name: string;
    departmentId: string;
    requiresColor: boolean;
    optionTypeId: string | null;
    attributes: { attributeId: string; required: boolean; sortOrder: number }[];
  }[];
  attributes: { id: string; code: string; name: string; isMulti: boolean; values: { id: string; name: string }[] }[];
  optionTypes: { id: string; code: string; name: string; values: { id: string; label: string }[] }[];
  brands: { id: string; name: string; lines: { id: string; name: string }[] }[];
  colors: { id: string; name: string; hex: string | null; family: string | null }[];
};

const CATALOG_MASTERS_KEY = "catalog-masters";

export function invalidateCatalogMasters(): void {
  invalidateCache(CATALOG_MASTERS_KEY);
}

export function getCatalogMasters(): Promise<CatalogMasters> {
  return cachedFor(CATALOG_MASTERS_KEY, CACHE_TTL.refs, loadCatalogMasters);
}

async function loadCatalogMasters(): Promise<CatalogMasters> {
  const supabase = await createClient();
  const [categories, categoryAttributes, attributes, attributeValues, optionTypes, optionValues, brands, lines, colors, families] = await Promise.all([
    fetchAllRows<Pick<Category, "id" | "name" | "parent_id" | "requires_color" | "option_type_id" | "is_active">>((from, to) =>
      supabase.from("categories").select("id, name, parent_id, requires_color, option_type_id, is_active").order("sort_order").order("name").order("id").range(from, to)),
    fetchAllRows<CategoryAttribute>((from, to) =>
      supabase.from("category_attributes").select("category_id, attribute_id, is_required, sort_order").order("category_id").order("sort_order").order("attribute_id").range(from, to)),
    fetchAllRows<Pick<AttributeRow, "id" | "code" | "name" | "is_multi">>((from, to) =>
      supabase.from("attributes").select("id, code, name, is_multi").order("sort_order").order("name").order("id").range(from, to)),
    fetchAllRows<Pick<AttributeValue, "id" | "attribute_id" | "name" | "is_active">>((from, to) =>
      supabase.from("attribute_values").select("id, attribute_id, name, is_active").order("attribute_id").order("sort_order").order("name").order("id").range(from, to)),
    fetchAllRows<Pick<OptionType, "id" | "code" | "name">>((from, to) =>
      supabase.from("option_types").select("id, code, name").order("sort_order").order("id").range(from, to)),
    fetchAllRows<Pick<OptionValue, "id" | "option_type_id" | "label" | "is_active">>((from, to) =>
      supabase.from("option_values").select("id, option_type_id, label, is_active").order("option_type_id").order("sort_order").order("id").range(from, to)),
    fetchAllRows<Pick<Brand, "id" | "name" | "is_active">>((from, to) =>
      supabase.from("brands").select("id, name, is_active").order("name").order("id").range(from, to)),
    fetchAllRows<Pick<ProductLine, "id" | "brand_id" | "name" | "is_active">>((from, to) =>
      supabase.from("product_lines").select("id, brand_id, name, is_active").order("brand_id").order("sort_order").order("id").range(from, to)),
    fetchAllRows<Pick<ColorRow, "id" | "name" | "hex" | "family_id" | "is_active">>((from, to) =>
      supabase.from("colors").select("id, name, hex, family_id, is_active").order("sort_order").order("name").order("id").range(from, to)),
    fetchAllRows<Pick<ColorFamily, "id" | "name">>((from, to) =>
      supabase.from("color_families").select("id, name").order("sort_order").order("id").range(from, to)),
  ]);

  const categoryAttributesById = groupBy(categoryAttributes, (row) => row.category_id);
  const attributeValuesById = groupBy(attributeValues.filter((row) => row.is_active), (row) => row.attribute_id);
  const optionValuesByType = groupBy(optionValues.filter((row) => row.is_active), (row) => row.option_type_id);
  const linesByBrand = groupBy(lines.filter((row) => row.is_active), (row) => row.brand_id);
  const familyById = new Map(families.map((family) => [family.id, family.name]));
  const activeCategories = categories.filter((category) => category.is_active);

  return {
    departments: activeCategories.filter((category) => category.parent_id === null).map(({ id, name }) => ({ id, name })),
    categories: activeCategories.filter((category): category is typeof category & { parent_id: string } => category.parent_id !== null).map((category) => ({
      id: category.id,
      name: category.name,
      departmentId: category.parent_id,
      requiresColor: category.requires_color,
      optionTypeId: category.option_type_id,
      attributes: (categoryAttributesById.get(category.id) ?? []).map((row) => ({ attributeId: row.attribute_id, required: row.is_required, sortOrder: row.sort_order })),
    })),
    attributes: attributes.map((attribute) => ({
      id: attribute.id,
      code: attribute.code,
      name: attribute.name,
      isMulti: attribute.is_multi,
      values: (attributeValuesById.get(attribute.id) ?? []).map(({ id, name }) => ({ id, name })),
    })),
    optionTypes: optionTypes.map((type) => ({
      id: type.id,
      code: type.code,
      name: type.name,
      values: (optionValuesByType.get(type.id) ?? []).map(({ id, label }) => ({ id, label })),
    })),
    brands: brands.filter((brand) => brand.is_active).map((brand) => ({
      id: brand.id,
      name: brand.name,
      lines: (linesByBrand.get(brand.id) ?? []).map(({ id, name }) => ({ id, name })),
    })),
    colors: colors.filter((color) => color.is_active).map((color) => ({
      id: color.id,
      name: color.name,
      hex: color.hex,
      family: color.family_id ? familyById.get(color.family_id) ?? null : null,
    })),
  };
}

export type ProductMediaItem = { id: string; colorId: string | null; path: string; url: string; sortOrder: number };
export type EditorVariant = {
  id: string;
  sku: string;
  colorId: string | null;
  optionValueId: string | null;
  price: number;
  cost: number;
  isActive: boolean;
  stockByBranch: Record<string, number>;
  saleLines: number;
  purchaseLines: number;
  aliases: string[];
};
export type ProductEditorData = {
  product: Product;
  attributeValueIds: string[];
  variants: EditorVariant[];
  media: ProductMediaItem[];
  colorNames: Record<string, { name: string; hex: string | null; isActive: boolean }>;
  readiness: Readiness;
  branches: { id: string; city: string }[];
};

/**
 * `branchScope`: sucursal a la que está limitado el usuario (`getProfileBranchScope`); con ella,
 * stock y sucursales se limitan a esa sucursal. `null` = puede ver todas.
 */
export async function getProductEditorData(id: string, branchScope: string | null = null): Promise<ProductEditorData | null> {
  const supabase = await createClient();
  const [{ data: product, error: productError }, variants, media, productAttributes, branches] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    fetchAllRows<ProductVariant>((from, to) =>
      supabase.from("product_variants").select("*").eq("product_id", id).order("sku").order("id").range(from, to)),
    fetchAllRows<ProductMedia>((from, to) =>
      supabase.from("product_media").select("*").eq("product_id", id).order("sort_order").order("id").range(from, to)),
    fetchAllRows<ProductAttributeValue>((from, to) =>
      supabase.from("product_attribute_values").select("product_id, attribute_value_id").eq("product_id", id).order("attribute_value_id").range(from, to)),
    fetchAllRows<Pick<Branch, "id" | "city">>((from, to) => {
      let query = supabase.from("branches").select("id, city");
      if (branchScope) query = query.eq("id", branchScope);
      return query.order("city").order("id").range(from, to);
    }),
  ]);
  if (productError) throw new Error(productError.message);
  if (!product) return null;

  const variantIds = variants.map((variant) => variant.id);
  const attributeValueIds = productAttributes.map((row) => row.attribute_value_id);
  const optionValueIds = [...new Set(variants.map((variant) => variant.option_value_id).filter((value): value is string => value !== null))];
  const colorIds = [...new Set([...variants.map((variant) => variant.color_id), ...media.map((photo) => photo.color_id)].filter((value): value is string => value !== null))];
  const categoryId = product.category_id;
  const [categoryResult, categoryAttributes, attributeValues, optionValues, colors, inventory, saleItems, purchaseItems, aliases] = await Promise.all([
    categoryId
      ? supabase.from("categories").select("id, parent_id, requires_color, option_type_id").eq("id", categoryId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    categoryId
      ? fetchAllRows<Pick<CategoryAttribute, "attribute_id" | "is_required">>((from, to) =>
          supabase.from("category_attributes").select("attribute_id, is_required").eq("category_id", categoryId).order("attribute_id").range(from, to))
      : Promise.resolve([]),
    attributeValueIds.length
      ? fetchAllRows<Pick<AttributeValue, "id" | "attribute_id">>((from, to) =>
          supabase.from("attribute_values").select("id, attribute_id").in("id", attributeValueIds).order("id").range(from, to))
      : Promise.resolve([]),
    optionValueIds.length
      ? fetchAllRows<Pick<OptionValue, "id" | "option_type_id">>((from, to) =>
          supabase.from("option_values").select("id, option_type_id").in("id", optionValueIds).order("id").range(from, to))
      : Promise.resolve([]),
    colorIds.length
      ? inChunks(colorIds, (part) => fetchAllRows<Pick<ColorRow, "id" | "name" | "hex" | "is_active">>((from, to) =>
          supabase.from("colors").select("id, name, hex, is_active").in("id", part).order("id").range(from, to)))
      : Promise.resolve([]),
    variantIds.length
      ? inChunks(variantIds, (part) => fetchAllRows<Pick<Inventory, "variant_id" | "branch_id" | "quantity">>((from, to) => {
          let query = supabase.from("inventory").select("variant_id, branch_id, quantity").in("variant_id", part);
          if (branchScope) query = query.eq("branch_id", branchScope);
          return query.order("id").range(from, to);
        }))
      : Promise.resolve([]),
    variantIds.length
      ? inChunks(variantIds, (part) => fetchAllRows<Pick<SaleItem, "variant_id">>((from, to) =>
          supabase.from("sale_items").select("variant_id").in("variant_id", part).order("id").range(from, to)))
      : Promise.resolve([]),
    variantIds.length
      ? inChunks(variantIds, (part) => fetchAllRows<Pick<PurchaseOrderItem, "variant_id">>((from, to) =>
          supabase.from("purchase_order_items").select("variant_id").in("variant_id", part).order("id").range(from, to)))
      : Promise.resolve([]),
    variantIds.length
      ? inChunks(variantIds, (part) => fetchAllRows<Pick<VariantSkuAlias, "variant_id" | "sku">>((from, to) =>
          supabase.from("variant_sku_aliases").select("variant_id, sku").in("variant_id", part).order("sku").range(from, to)))
      : Promise.resolve([]),
  ]);
  if (categoryResult.error) throw new Error(categoryResult.error.message);

  const optionTypeByValue = new Map(optionValues.map((row) => [row.id, row.option_type_id]));
  const attributeByValue = new Map(attributeValues.map((row) => [row.id, row.attribute_id]));
  const stockByVariant = new Map<string, Record<string, number>>();
  for (const row of inventory) {
    const stock = stockByVariant.get(row.variant_id) ?? {};
    stock[row.branch_id] = (stock[row.branch_id] ?? 0) + row.quantity;
    stockByVariant.set(row.variant_id, stock);
  }
  const saleLinesByVariant = countBy(saleItems, (row) => row.variant_id);
  const purchaseLinesByVariant = countBy(purchaseItems, (row) => row.variant_id);
  const aliasesByVariant = groupBy(aliases, (row) => row.variant_id);

  return {
    product,
    attributeValueIds,
    variants: variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      colorId: variant.color_id,
      optionValueId: variant.option_value_id,
      price: variant.price,
      cost: variant.cost,
      isActive: variant.is_active,
      stockByBranch: stockByVariant.get(variant.id) ?? {},
      saleLines: saleLinesByVariant.get(variant.id) ?? 0,
      purchaseLines: purchaseLinesByVariant.get(variant.id) ?? 0,
      aliases: (aliasesByVariant.get(variant.id) ?? []).map((row) => row.sku),
    })),
    media: media.map((photo) => ({
      id: photo.id,
      colorId: photo.color_id,
      path: photo.path,
      url: mediaPublicUrl(photo.path) ?? "",
      sortOrder: photo.sort_order,
    })),
    colorNames: Object.fromEntries(colors.map((color) => [color.id, { name: color.name, hex: color.hex, isActive: color.is_active }])),
    readiness: readinessFor(
      product,
      categoryResult.data,
      categoryAttributes.filter((row) => row.is_required).map((row) => row.attribute_id),
      [...new Set(attributeValueIds.map((valueId) => attributeByValue.get(valueId)).filter((value): value is string => value !== undefined))],
      variants,
      media,
      optionTypeByValue,
    ),
    branches,
  };
}

export async function getMainPhotoUrls(productIds?: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (productIds && productIds.length === 0) return result;
  const supabase = await createClient();
  type MediaRow = Pick<ProductMedia, "id" | "product_id" | "color_id" | "path" | "sort_order">;
  type VariantRow = Pick<ProductVariant, "id" | "product_id" | "color_id" | "sku" | "is_active">;
  const loadMedia = (ids: string[] | null) =>
    fetchAllRows<MediaRow>((from, to) => {
      let query = supabase.from("product_media").select("id, product_id, color_id, path, sort_order");
      if (ids) query = query.in("product_id", ids);
      return query.order("product_id").order("sort_order").order("id").range(from, to);
    });
  const loadVariants = (ids: string[] | null) =>
    fetchAllRows<VariantRow>((from, to) => {
      let query = supabase.from("product_variants").select("id, product_id, color_id, sku, is_active");
      if (ids) query = query.in("product_id", ids);
      return query.order("product_id").order("sku").order("id").range(from, to);
    });
  // Con ids se filtra siempre, por grupos de 100 (un «in» con cientos de ids arma una URL
  // demasiado larga). Sin ids, todo el catálogo (lista de productos).
  const groups = productIds ? chunk([...new Set(productIds)], 100) : [null];
  const [mediaGroups, variantGroups] = await Promise.all([
    Promise.all(groups.map(loadMedia)),
    Promise.all(groups.map(loadVariants)),
  ]);
  const media = mediaGroups.flat();
  const variants = variantGroups.flat();
  const colorIds = [...new Set(variants.map((variant) => variant.color_id).filter((value): value is string => value !== null))];
  const colors = colorIds.length
    ? await inChunks(colorIds, (part) => fetchAllRows<Pick<ColorRow, "id" | "name">>((from, to) =>
        supabase.from("colors").select("id, name").in("id", part).order("id").range(from, to)))
    : [];
  const colorNames = Object.fromEntries(colors.map((color) => [color.id, color.name]));
  const mediaByProduct = groupBy(media, (row) => row.product_id);
  const variantsByProduct = groupBy(variants, (row) => row.product_id);
  for (const [productId, photos] of mediaByProduct) {
    const main = pickMainPhoto(
      photos.map((photo) => ({ ...photo, colorId: photo.color_id, sortOrder: photo.sort_order })),
      orderProductColors((variantsByProduct.get(productId) ?? []).map((variant) => ({
        colorId: variant.color_id, isActive: variant.is_active, sku: variant.sku,
      })), colorNames),
    );
    if (main) {
      const url = mediaPublicUrl(main.path);
      if (url) result.set(productId, url);
    }
  }
  return result;
}

export async function getReadinessByProduct(): Promise<Map<string, Readiness>> {
  const supabase = await createClient();
  const [products, categories, categoryAttributes, productAttributes, attributeValues, variants, optionValues, media] = await Promise.all([
    fetchAllRows<Pick<Product, "id" | "is_active" | "description" | "brand_id" | "category_id">>((from, to) =>
      supabase.from("products").select("id, is_active, description, brand_id, category_id").order("id").range(from, to)),
    fetchAllRows<Pick<Category, "id" | "parent_id" | "requires_color" | "option_type_id">>((from, to) =>
      supabase.from("categories").select("id, parent_id, requires_color, option_type_id").order("id").range(from, to)),
    fetchAllRows<CategoryAttribute>((from, to) =>
      supabase.from("category_attributes").select("category_id, attribute_id, is_required, sort_order").order("category_id").order("attribute_id").range(from, to)),
    fetchAllRows<ProductAttributeValue>((from, to) =>
      supabase.from("product_attribute_values").select("product_id, attribute_value_id").order("product_id").order("attribute_value_id").range(from, to)),
    fetchAllRows<Pick<AttributeValue, "id" | "attribute_id">>((from, to) =>
      supabase.from("attribute_values").select("id, attribute_id").order("id").range(from, to)),
    fetchAllRows<Pick<ProductVariant, "id" | "product_id" | "sku" | "is_active" | "price" | "color_id" | "option_value_id">>((from, to) =>
      supabase.from("product_variants").select("id, product_id, sku, is_active, price, color_id, option_value_id").order("product_id").order("sku").order("id").range(from, to)),
    fetchAllRows<Pick<OptionValue, "id" | "option_type_id">>((from, to) =>
      supabase.from("option_values").select("id, option_type_id").order("id").range(from, to)),
    fetchAllRows<Pick<ProductMedia, "id" | "product_id" | "color_id">>((from, to) =>
      supabase.from("product_media").select("id, product_id, color_id").order("product_id").order("id").range(from, to)),
  ]);

  const categoryById = new Map(categories.map((row) => [row.id, row]));
  const requiredByCategory = groupBy(categoryAttributes.filter((row) => row.is_required), (row) => row.category_id);
  const attributeByValue = new Map(attributeValues.map((row) => [row.id, row.attribute_id]));
  const valuesByProduct = groupBy(productAttributes, (row) => row.product_id);
  const variantsByProduct = groupBy(variants, (row) => row.product_id);
  const mediaByProduct = groupBy(media, (row) => row.product_id);
  const optionTypeByValue = new Map(optionValues.map((row) => [row.id, row.option_type_id]));
  const result = new Map<string, Readiness>();

  for (const product of products) {
    const attributeIds = [...new Set((valuesByProduct.get(product.id) ?? [])
      .map((row) => attributeByValue.get(row.attribute_value_id))
      .filter((value): value is string => value !== undefined))];
    result.set(product.id, readinessFor(
      product,
      product.category_id ? categoryById.get(product.category_id) ?? null : null,
      product.category_id ? (requiredByCategory.get(product.category_id) ?? []).map((row) => row.attribute_id) : [],
      attributeIds,
      variantsByProduct.get(product.id) ?? [],
      mediaByProduct.get(product.id) ?? [],
      optionTypeByValue,
    ));
  }
  return result;
}

function readinessFor(
  product: Pick<Product, "is_active" | "description" | "brand_id">,
  category: Pick<Category, "id" | "parent_id" | "requires_color" | "option_type_id"> | null,
  requiredAttributeIds: string[],
  attributeIdsWithValue: string[],
  variants: Pick<ProductVariant, "id" | "sku" | "is_active" | "price" | "color_id" | "option_value_id">[],
  media: Pick<ProductMedia, "color_id">[],
  optionTypeByValue: Map<string, string>,
): Readiness {
  const input: ReadinessInput = {
    isActive: product.is_active,
    description: product.description,
    brandId: product.brand_id,
    category: category ? { id: category.id, parentId: category.parent_id, requiresColor: category.requires_color, optionTypeId: category.option_type_id } : null,
    requiredAttributeIds,
    attributeIdsWithValue,
    variants: variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      isActive: variant.is_active,
      price: variant.price,
      colorId: variant.color_id,
      optionValueId: variant.option_value_id,
      optionTypeId: variant.option_value_id ? optionTypeByValue.get(variant.option_value_id) ?? null : null,
    })),
    media: media.map((photo) => ({ colorId: photo.color_id })),
  };
  return productReadiness(input);
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = grouped.get(id) ?? [];
    group.push(row);
    grouped.set(id, group);
  }
  return grouped;
}

function countBy<T>(rows: T[], key: (row: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = key(row);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
