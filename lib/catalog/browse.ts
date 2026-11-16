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
  readyOnly?: boolean;
};

function searchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function filterCatalogProducts<T extends BrowseFilterProduct>(products: T[], filters: BrowseFilters): T[] {
  const query = searchText(filters.query?.trim() ?? "");
  return products.filter((product) =>
    (!filters.departmentId || product.departmentId === filters.departmentId)
    && (!filters.categoryId || product.categoryId === filters.categoryId)
    && (!filters.brandId || product.brandId === filters.brandId)
    && (!filters.readyOnly || product.ready)
    && (!query || searchText(`${product.name} ${product.brand ?? ""}`).includes(query))
  );
}
