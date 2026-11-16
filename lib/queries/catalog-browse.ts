import "server-only";

import { orderProductColors } from "@/lib/catalog/media";
import type { Missing } from "@/lib/catalog/readiness";
import type {
  AttributeRow, AttributeValue, Brand, ColorRow, OptionValue, Product,
  ProductAttributeValue, ProductLine, ProductMedia, ProductSpec, ProductVariant,
} from "@/lib/database.types";
import { mediaPublicUrl } from "@/lib/product-images";
import { getCatalogMasters, getMainPhotoUrls, getReadinessByProduct, type CatalogMasters } from "@/lib/queries/catalog";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { createClient } from "@/lib/supabase/server";

export type CatalogBrowseProduct = {
  id: string;
  name: string;
  description: string | null;
  specs: ProductSpec[];
  brandId: string | null;
  brand: string | null;
  line: string | null;
  departmentId: string | null;
  categoryId: string | null;
  priceMin: number | null;
  priceMax: number | null;
  mainPhotoUrl: string | null;
  ready: boolean;
  missing: Missing[];
  attributes: { name: string; values: string[] }[];
  colors: { id: string; name: string; hex: string | null; photos: string[]; options: string[] }[];
  generalPhotos: string[];
  hasUncoloredVariants: boolean;
  uncoloredOptions: string[];
};

export type CatalogBrowseData = {
  products: CatalogBrowseProduct[];
  departments: { id: string; name: string; categories: { id: string; name: string; productCount: number }[] }[];
  brands: { id: string; name: string }[];
  masters: CatalogMasters;
};

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  return groups;
}

export async function getCatalogBrowseData(): Promise<CatalogBrowseData> {
  const supabase = await createClient();
  const [masters, mainPhotos, readiness, products, variants, media, selections, attributeValues, attributes, colors, optionValues, brands, lines] = await Promise.all([
    getCatalogMasters(),
    getMainPhotoUrls(),
    getReadinessByProduct(),
    fetchAllRows<Pick<Product, "id" | "name" | "description" | "specs" | "brand_id" | "line_id" | "category_id">>((from, to) =>
      supabase.from("products").select("id, name, description, specs, brand_id, line_id, category_id").eq("is_active", true).order("name").order("id").range(from, to)),
    fetchAllRows<Pick<ProductVariant, "id" | "product_id" | "sku" | "color_id" | "option_value_id" | "price" | "is_active">>((from, to) =>
      supabase.from("product_variants").select("id, product_id, sku, color_id, option_value_id, price, is_active").eq("is_active", true).order("product_id").order("sku").order("id").range(from, to)),
    fetchAllRows<Pick<ProductMedia, "id" | "product_id" | "color_id" | "path" | "sort_order">>((from, to) =>
      supabase.from("product_media").select("id, product_id, color_id, path, sort_order").order("product_id").order("sort_order").order("id").range(from, to)),
    fetchAllRows<ProductAttributeValue>((from, to) =>
      supabase.from("product_attribute_values").select("product_id, attribute_value_id").order("product_id").order("attribute_value_id").range(from, to)),
    fetchAllRows<Pick<AttributeValue, "id" | "attribute_id" | "name" | "sort_order">>((from, to) =>
      supabase.from("attribute_values").select("id, attribute_id, name, sort_order").order("attribute_id").order("sort_order").order("id").range(from, to)),
    fetchAllRows<Pick<AttributeRow, "id" | "name" | "sort_order">>((from, to) =>
      supabase.from("attributes").select("id, name, sort_order").order("sort_order").order("id").range(from, to)),
    fetchAllRows<Pick<ColorRow, "id" | "name" | "hex">>((from, to) =>
      supabase.from("colors").select("id, name, hex").order("id").range(from, to)),
    fetchAllRows<Pick<OptionValue, "id" | "label" | "sort_order" | "option_type_id">>((from, to) =>
      supabase.from("option_values").select("id, label, sort_order, option_type_id").order("option_type_id").order("sort_order").order("id").range(from, to)),
    fetchAllRows<Pick<Brand, "id" | "name">>((from, to) =>
      supabase.from("brands").select("id, name").order("name").order("id").range(from, to)),
    fetchAllRows<Pick<ProductLine, "id" | "name">>((from, to) =>
      supabase.from("product_lines").select("id, name").order("id").range(from, to)),
  ]);

  const variantsByProduct = groupBy(variants, (row) => row.product_id);
  const mediaByProduct = groupBy(media, (row) => row.product_id);
  const selectionsByProduct = groupBy(selections, (row) => row.product_id);
  const attributeValueById = new Map(attributeValues.map((row) => [row.id, row]));
  const attributeById = new Map(attributes.map((row) => [row.id, row]));
  const colorById = new Map(colors.map((row) => [row.id, row]));
  const colorNames = Object.fromEntries(colors.map((row) => [row.id, row.name]));
  const optionById = new Map(optionValues.map((row) => [row.id, row]));
  const brandById = new Map(brands.map((row) => [row.id, row.name]));
  const lineById = new Map(lines.map((row) => [row.id, row.name]));
  const categoryById = new Map(masters.categories.map((row) => [row.id, row]));
  const countByCategory = new Map<string, number>();

  const browseProducts = products.map((product): CatalogBrowseProduct => {
    const activeVariants = variantsByProduct.get(product.id) ?? [];
    const photos = mediaByProduct.get(product.id) ?? [];
    const valuesByAttribute = new Map<string, { name: string; order: number }[]>();
    for (const selection of selectionsByProduct.get(product.id) ?? []) {
      const value = attributeValueById.get(selection.attribute_value_id);
      if (!value) continue;
      const list = valuesByAttribute.get(value.attribute_id) ?? [];
      list.push({ name: value.name, order: value.sort_order });
      valuesByAttribute.set(value.attribute_id, list);
    }
    const attributesForProduct = [...valuesByAttribute.entries()]
      .sort(([a], [b]) => (attributeById.get(a)?.sort_order ?? 0) - (attributeById.get(b)?.sort_order ?? 0) || a.localeCompare(b))
      .map(([id, values]) => ({
        name: attributeById.get(id)?.name ?? "Característica",
        values: values.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es")).map((value) => value.name),
      }));

    const optionsFor = (colorId: string | null): string[] => {
      const used = new Map<string, { label: string; order: number }>();
      for (const variant of activeVariants) {
        if (variant.color_id !== colorId || !variant.option_value_id) continue;
        const option = optionById.get(variant.option_value_id);
        if (option) used.set(option.id, { label: option.label, order: option.sort_order });
      }
      return [...used.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "es")).map((item) => item.label);
    };
    const photoUrlsFor = (colorId: string | null) => photos
      .filter((photo) => photo.color_id === colorId)
      .map((photo) => mediaPublicUrl(photo.path))
      .filter((url): url is string => url !== null);
    const orderedColorIds = orderProductColors(activeVariants.map((variant) => ({
      colorId: variant.color_id, isActive: variant.is_active, sku: variant.sku,
    })), colorNames);
    const prices = activeVariants.map((variant) => variant.price);
    const category = product.category_id ? categoryById.get(product.category_id) : null;
    if (product.category_id) countByCategory.set(product.category_id, (countByCategory.get(product.category_id) ?? 0) + 1);
    const state = readiness.get(product.id);

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      specs: product.specs ?? [],
      brandId: product.brand_id,
      brand: product.brand_id ? brandById.get(product.brand_id) ?? null : null,
      line: product.line_id ? lineById.get(product.line_id) ?? null : null,
      departmentId: category?.departmentId ?? null,
      categoryId: product.category_id,
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
      mainPhotoUrl: mainPhotos.get(product.id) ?? null,
      ready: state?.ready ?? false,
      missing: state?.missing ?? [],
      attributes: attributesForProduct,
      colors: orderedColorIds.map((id) => ({
        id, name: colorById.get(id)?.name ?? "Color", hex: colorById.get(id)?.hex ?? null,
        photos: photoUrlsFor(id), options: optionsFor(id),
      })),
      generalPhotos: photoUrlsFor(null),
      hasUncoloredVariants: activeVariants.some((variant) => variant.color_id === null),
      uncoloredOptions: optionsFor(null),
    };
  });

  return {
    products: browseProducts,
    departments: masters.departments.map((department) => ({
      ...department,
      categories: masters.categories.filter((category) => category.departmentId === department.id).map((category) => ({
        id: category.id, name: category.name, productCount: countByCategory.get(category.id) ?? 0,
      })),
    })),
    brands: brands.filter((brand) => browseProducts.some((product) => product.brandId === brand.id)),
    masters,
  };
}
