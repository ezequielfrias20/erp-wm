export type BrowseFilterProduct = {
  name: string;
  brandId: string | null;
  brand: string | null;
  departmentId: string | null;
  categoryId: string | null;
  ready: boolean;
};

export type BrowseFilters = {
  query?: string;
  brandId?: string;
  departmentId?: string;
  categoryId?: string;
  uncategorizedOnly?: boolean;
  unassignedOnly?: boolean;
  readyOnly?: boolean;
};

export function classifyBrowseCategory(
  categoryId: string | null,
  categories: ReadonlyMap<string, { parent_id: string | null }>,
  activeCategoryIds: ReadonlySet<string>,
): { departmentId: string | null; categoryId: string | null } {
  if (!categoryId) return { departmentId: null, categoryId: null };
  const category = categories.get(categoryId);
  if (!category) return { departmentId: null, categoryId: null };
  if (category.parent_id === null) return { departmentId: categoryId, categoryId: null };
  return {
    departmentId: category.parent_id,
    categoryId: activeCategoryIds.has(categoryId) ? categoryId : null,
  };
}

function searchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function filterCatalogProducts<T extends BrowseFilterProduct>(products: T[], filters: BrowseFilters): T[] {
  const query = searchText(filters.query?.trim() ?? "");
  return products.filter((product) =>
    (!filters.departmentId || product.departmentId === filters.departmentId)
    && (!filters.categoryId || product.categoryId === filters.categoryId)
    && (!filters.uncategorizedOnly || product.categoryId === null)
    && (!filters.unassignedOnly || product.departmentId === null)
    && (!filters.brandId || product.brandId === filters.brandId)
    && (!filters.readyOnly || product.ready)
    && (!query || searchText(`${product.name} ${product.brand ?? ""}`).includes(query))
  );
}
