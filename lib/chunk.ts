/**
 * Parte una lista en grupos de `size`. Sirve para filtros `.in(...)` de Supabase: con cientos
 * de ids la URL se vuelve demasiado larga, así que se consulta por grupos.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("chunk: el tamaño debe ser un entero positivo");
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}
