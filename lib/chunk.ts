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

/** Ejecuta `fetch` por grupos de `size` ids (en paralelo) y junta los resultados en orden. */
export async function inChunks<T>(ids: string[], fetch: (part: string[]) => Promise<T[]>, size = 100): Promise<T[]> {
  const results = await Promise.all(chunk(ids, size).map((part) => fetch(part)));
  return results.flat();
}
