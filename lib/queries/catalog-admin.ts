import "server-only";

import type { CatalogAdminData } from "@/lib/catalog/admin-types";

// TODO(plan 3b, Task 2): implementar (maestros con inactivos + conteos de uso).
export async function getCatalogAdminData(): Promise<CatalogAdminData> {
  return { families: [], colors: [], optionTypes: [], attributes: [], departments: [], brands: [] };
}
