/**
 * Foto del catálogo de producción tal como la exporta `scripts/catalogo/snapshot.sql`.
 * Es la entrada de la propuesta de clasificación (Excel de revisión).
 */

export type SnapshotNamed = { id: string; name: string };

export type SnapshotColor = { id: string; name: string; hex: string | null };

export type SnapshotProduct = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  is_active: boolean;
  visible_in_catalog: boolean;
  has_image: boolean;
  created_at: string;
  updated_at: string;
};

export type SnapshotVariant = {
  id: string;
  product_id: string;
  sku: string;
  color: string | null;
  color_hex: string | null;
  size: string | null;
  price: number;
  cost: number;
  is_active: boolean;
  /** branch_id → cantidad */
  stock: Record<string, number>;
  /** Nº de filas de `sale_items` que apuntan a la variante. */
  sale_lines: number;
  created_at: string;
  updated_at: string;
};

export type CatalogSnapshot = {
  taken_at: string;
  branches: SnapshotNamed[];
  categories: SnapshotNamed[];
  brands: SnapshotNamed[];
  colors: SnapshotColor[];
  products: SnapshotProduct[];
  variants: SnapshotVariant[];
};
