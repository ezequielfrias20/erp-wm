/**
 * Tipos del catálogo de inventario que se carga bajo demanda.
 *
 * Vive fuera de `lib/queries/` porque lo comparten la consulta (`server-only`) y el
 * componente de cliente que la invoca por Server Action. Si el cliente importara el
 * módulo de consultas, arrastraría `lib/supabase/server` al bundle del navegador.
 */

export type InventoryVariantOption = {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  color_hex: string | null;
};

export type InventoryBranchOption = {
  id: string;
  city: string;
  code: string;
};

export type InventoryOptions = {
  variantOptions: InventoryVariantOption[];
  skuOptions: string[];
  branchOptions: string[];
  inventoryBranches: InventoryBranchOption[];
};

export const EMPTY_INVENTORY_OPTIONS: InventoryOptions = {
  variantOptions: [],
  skuOptions: [],
  branchOptions: [],
  inventoryBranches: [],
};
