/**
 * Datos de Configuración → Catálogo (plan 3b). Incluye maestros inactivos y cuántas veces se usa
 * cada uno, para decidir si se puede borrar o sólo desactivar.
 */
export type AdminColorFamily = { id: string; name: string; hex: string | null };

export type AdminColor = {
  id: string;
  name: string;
  slug: string | null;
  hex: string | null;
  familyId: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Variantes (activas o no) con este color. */
  variantCount: number;
};

export type AdminOptionValue = {
  id: string;
  label: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  variantCount: number;
};

export type AdminOptionType = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  /** Categorías que usan este tipo de opción. */
  categoryCount: number;
  values: AdminOptionValue[];
};

export type AdminAttributeValue = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  /** Productos con este valor. */
  productCount: number;
};

export type AdminAttribute = {
  id: string;
  code: string;
  name: string;
  isMulti: boolean;
  sortOrder: number;
  categoryCount: number;
  values: AdminAttributeValue[];
};

export type AdminCategory = {
  id: string;
  name: string;
  slug: string | null;
  sortOrder: number;
  isActive: boolean;
  optionTypeId: string | null;
  requiresColor: boolean;
  productCount: number;
  attributes: { attributeId: string; required: boolean; sortOrder: number }[];
};

export type AdminDepartment = {
  id: string;
  name: string;
  slug: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Productos asignados directamente al departamento (no a una de sus categorías). */
  productCount: number;
  categories: AdminCategory[];
};

export type AdminLine = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
};

export type AdminBrand = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  isActive: boolean;
  productCount: number;
  lines: AdminLine[];
};

export type CatalogAdminData = {
  families: AdminColorFamily[];
  colors: AdminColor[];
  optionTypes: AdminOptionType[];
  attributes: AdminAttribute[];
  departments: AdminDepartment[];
  brands: AdminBrand[];
};

/** Resultado de toda acción de maestros. */
export type MasterResult = { ok?: boolean; error?: string; id?: string } | null;

export type ColorInput = { id?: string; name: string; slug?: string; hex: string; familyId: string; isActive: boolean };
export type OptionTypeInput = { id?: string; name: string };
export type OptionValueInput = { id?: string; optionTypeId: string; label: string; slug?: string; isActive: boolean };
export type AttributeInput = { id?: string; name: string; isMulti: boolean };
export type AttributeValueInput = { id?: string; attributeId: string; name: string; slug?: string; isActive: boolean };
export type CategoryInput = {
  id?: string;
  name: string;
  slug?: string;
  /** null = departamento. */
  parentId: string | null;
  isActive: boolean;
  /** Sólo categorías (con padre); en un departamento se ignoran. */
  optionTypeId: string | null;
  requiresColor: boolean;
  attributes: { attributeId: string; required: boolean }[];
};
export type BrandInput = { id?: string; name: string; slug?: string; description: string | null; isActive: boolean };
export type LineInput = { id?: string; brandId: string; name: string; slug?: string; isActive: boolean };
