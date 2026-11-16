import { slugify } from "@/lib/catalog-migration/cleanup-plan";

export function manualSlugError(input: string): string | null {
  return slugify(input) === "x" && !/[a-z0-9]/.test(input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
    ? "El slug debe tener letras o números." : null;
}

export function singleValueChangeError(wasMulti: boolean, isMulti: boolean, multiValueProducts: number): string | null {
  return wasMulti && !isMulti && multiValueProducts > 0
    ? `${multiValueProducts} productos tienen varios valores de esta característica. Déjales uno antes de cambiarla a un solo valor.`
    : null;
}

export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    return `#${[...value].map((digit) => digit.repeat(2)).join("").toUpperCase()}`;
  }
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toUpperCase()}` : null;
}

export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const root = slugify(base);
  const existing = new Set(taken);
  if (!existing.has(root)) return root;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
}

export function sameName(a: string, b: string): boolean {
  const key = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  return key(a) === key(b);
}

export function inUseMessage(count: number, what: string, canDeactivate: boolean): string | null {
  if (count <= 0) return null;
  return `En uso por ${count} ${what}.${canDeactivate ? " Desactívalo en su lugar." : ""}`;
}

export function categoryPlacementError(input: {
  parentId: string | null;
  parentIsDepartment: boolean;
  hasChildren: boolean;
}): string | null {
  if (input.parentId === null) return null;
  if (input.hasChildren) return "Un departamento con categorías no puede pasar a ser categoría.";
  if (!input.parentIsDepartment) return "La categoría debe pertenecer a un departamento.";
  return null;
}

export function departmentDeactivationError(activeChildren: number): string | null {
  return activeChildren > 0
    ? `El departamento tiene ${activeChildren} categorías activas. Desactívalas primero.`
    : null;
}

/**
 * Un color se borra sólo sin variantes ni fotos: product_media.color_id es ON DELETE SET NULL y
 * sus fotos pasarían a «General» (aparecerían para todos los colores).
 */
export function colorDeleteError(variantCount: number, photoCount: number): string | null {
  return inUseMessage(variantCount, "variantes", true) ?? inUseMessage(photoCount, "fotos", true);
}

/**
 * Cambios de las características de una categoría sin dejarla nunca vacía a medio camino: primero
 * se insertan/actualizan las elegidas (con su orden) y después se quitan sólo las que ya no están.
 */
export function attributeLinkChanges(
  currentIds: string[],
  next: { attributeId: string; required: boolean }[],
): { upsert: { attributeId: string; required: boolean; sortOrder: number }[]; remove: string[] } {
  const keep = new Set(next.map((row) => row.attributeId));
  return {
    upsert: next.map((row, index) => ({ attributeId: row.attributeId, required: row.required, sortOrder: index })),
    remove: currentIds.filter((id) => !keep.has(id)),
  };
}

/** Una categoría activa dentro de un departamento inactivo desaparecería del editor y del catálogo. */
export function categoryActivationError(input: { isActive: boolean; parentId: string | null; parentIsActive: boolean }): string | null {
  return input.isActive && input.parentId && !input.parentIsActive
    ? "El departamento está inactivo: actívalo antes o deja la categoría inactiva."
    : null;
}
