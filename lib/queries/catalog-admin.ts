import "server-only";

import type { CatalogAdminData, AdminCategory } from "@/lib/catalog/admin-types";
import type {
  AttributeRow, AttributeValue, Brand, Category, CategoryAttribute, ColorFamily,
  ColorRow, OptionType, OptionValue, Product, ProductAttributeValue, ProductLine,
  ProductMedia, ProductVariant,
} from "@/lib/database.types";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { createClient } from "@/lib/supabase/server";

function counts<T>(rows: T[], key: (row: T) => string | null): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    const id = key(row);
    if (id) result.set(id, (result.get(id) ?? 0) + 1);
  }
  return result;
}

function ordered<T>(rows: T[], order: (row: T) => number, name: (row: T) => string): T[] {
  return rows.sort((a, b) => order(a) - order(b) || name(a).localeCompare(name(b), "es", { numeric: true }));
}

export async function getCatalogAdminData(): Promise<CatalogAdminData> {
  const db = await createClient();
  const [families, colors, optionTypes, optionValues, attributes, attributeValues, categories,
    categoryAttributes, brands, lines, variants, products, productAttributeValues, media] = await Promise.all([
    fetchAllRows<ColorFamily>((from, to) => db.from("color_families").select("*").order("id").range(from, to)),
    fetchAllRows<ColorRow>((from, to) => db.from("colors").select("*").order("id").range(from, to)),
    fetchAllRows<OptionType>((from, to) => db.from("option_types").select("*").order("id").range(from, to)),
    fetchAllRows<OptionValue>((from, to) => db.from("option_values").select("*").order("id").range(from, to)),
    fetchAllRows<AttributeRow>((from, to) => db.from("attributes").select("*").order("id").range(from, to)),
    fetchAllRows<AttributeValue>((from, to) => db.from("attribute_values").select("*").order("id").range(from, to)),
    fetchAllRows<Category>((from, to) => db.from("categories").select("*").order("id").range(from, to)),
    fetchAllRows<CategoryAttribute>((from, to) => db.from("category_attributes").select("*").order("category_id").order("attribute_id").range(from, to)),
    fetchAllRows<Brand>((from, to) => db.from("brands").select("*").order("id").range(from, to)),
    fetchAllRows<ProductLine>((from, to) => db.from("product_lines").select("*").order("id").range(from, to)),
    fetchAllRows<Pick<ProductVariant, "color_id" | "option_value_id">>((from, to) => db.from("product_variants").select("color_id, option_value_id").order("id").range(from, to)),
    fetchAllRows<Pick<Product, "category_id" | "brand_id" | "line_id">>((from, to) => db.from("products").select("category_id, brand_id, line_id").order("id").range(from, to)),
    fetchAllRows<Pick<ProductAttributeValue, "attribute_value_id">>((from, to) => db.from("product_attribute_values").select("attribute_value_id").order("product_id").order("attribute_value_id").range(from, to)),
    fetchAllRows<Pick<ProductMedia, "color_id">>((from, to) => db.from("product_media").select("color_id").not("color_id", "is", null).order("id").range(from, to)),
  ]);
  const colorUses = counts(variants, (row) => row.color_id);
  const colorPhotoUses = counts(media, (row) => row.color_id);
  const optionUses = counts(variants, (row) => row.option_value_id);
  const categoryUses = counts(products, (row) => row.category_id);
  const brandUses = counts(products, (row) => row.brand_id);
  const lineUses = counts(products, (row) => row.line_id);
  const attributeValueUses = counts(productAttributeValues, (row) => row.attribute_value_id);
  const optionCategoryUses = counts(categories, (row) => row.option_type_id);
  const attributeCategoryUses = counts(categoryAttributes, (row) => row.attribute_id);
  const categoryAttributesById = new Map<string, AdminCategory["attributes"]>();
  for (const row of categoryAttributes) {
    const list = categoryAttributesById.get(row.category_id) ?? [];
    list.push({ attributeId: row.attribute_id, required: row.is_required, sortOrder: row.sort_order });
    categoryAttributesById.set(row.category_id, list);
  }
  for (const list of categoryAttributesById.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  const categoryItems = ordered(categories, (row) => row.sort_order, (row) => row.name).map((row) => ({
    id: row.id, name: row.name, slug: row.slug, sortOrder: row.sort_order,
    isActive: row.is_active, optionTypeId: row.option_type_id, requiresColor: row.requires_color,
    productCount: categoryUses.get(row.id) ?? 0, attributes: categoryAttributesById.get(row.id) ?? [],
  }));
  const itemById = new Map(categoryItems.map((row) => [row.id, row]));
  return {
    families: ordered(families, (row) => row.sort_order, (row) => row.name).map((row) => ({ id: row.id, name: row.name, hex: row.hex })),
    colors: ordered(colors, (row) => row.sort_order, (row) => row.name).map((row) => ({
      id: row.id, name: row.name, slug: row.slug, hex: row.hex, familyId: row.family_id,
      isActive: row.is_active, sortOrder: row.sort_order, variantCount: colorUses.get(row.id) ?? 0, photoCount: colorPhotoUses.get(row.id) ?? 0,
    })),
    optionTypes: ordered(optionTypes, (row) => row.sort_order, (row) => row.name).map((row) => ({
      id: row.id, code: row.code, name: row.name, sortOrder: row.sort_order,
      categoryCount: optionCategoryUses.get(row.id) ?? 0,
      values: ordered(optionValues.filter((value) => value.option_type_id === row.id), (value) => value.sort_order, (value) => value.label).map((value) => ({
        id: value.id, label: value.label, slug: value.slug, sortOrder: value.sort_order,
        isActive: value.is_active, variantCount: optionUses.get(value.id) ?? 0,
      })),
    })),
    attributes: ordered(attributes, (row) => row.sort_order, (row) => row.name).map((row) => ({
      id: row.id, code: row.code, name: row.name, isMulti: row.is_multi, sortOrder: row.sort_order,
      categoryCount: attributeCategoryUses.get(row.id) ?? 0,
      values: ordered(attributeValues.filter((value) => value.attribute_id === row.id), (value) => value.sort_order, (value) => value.name).map((value) => ({
        id: value.id, name: value.name, slug: value.slug, sortOrder: value.sort_order,
        isActive: value.is_active, productCount: attributeValueUses.get(value.id) ?? 0,
      })),
    })),
    departments: categories.filter((row) => row.parent_id === null).map((row) => ({
      ...itemById.get(row.id)!,
      categories: categories.filter((child) => child.parent_id === row.id).map((child) => itemById.get(child.id)!),
    })).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es", { numeric: true })),
    brands: brands.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })).map((row) => ({
      id: row.id, name: row.name, slug: row.slug, description: row.description,
      isActive: row.is_active, productCount: brandUses.get(row.id) ?? 0,
      lines: ordered(lines.filter((line) => line.brand_id === row.id), (line) => line.sort_order, (line) => line.name).map((line) => ({
        id: line.id, name: line.name, slug: line.slug, sortOrder: line.sort_order,
        isActive: line.is_active, productCount: lineUses.get(line.id) ?? 0,
      })),
    })),
  };
}
