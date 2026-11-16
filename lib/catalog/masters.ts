import { slugify } from "@/lib/catalog-migration/cleanup-plan";

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
