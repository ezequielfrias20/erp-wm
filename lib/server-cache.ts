import "server-only";

/**
 * Caché de proceso con TTL para datos que no cambian entre navegaciones.
 *
 * `cache()` de React sólo deduplica dentro de una misma petición: el perfil, los
 * permisos y la marca se volvían a resolver contra Supabase en cada vista, y cada
 * viaje cuesta ~200 ms. Esto lo memoriza en el proceso.
 *
 * El TTL es corto a propósito: una instancia que no fue la que hizo el cambio se
 * pone al día sola, y la que sí lo hizo invalida explícitamente. No es un caché
 * compartido entre instancias ni pretende serlo.
 */

type Entry<T> = { value: T; expiresAt: number };

const MAX_ENTRIES = 500;

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
  // Si sigue lleno, descarta las entradas más antiguas (Map conserva orden de inserción).
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

/** Devuelve el valor memorizado o lo carga. Peticiones concurrentes comparten la carga. */
export async function cachedFor<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    const value = await load();
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    evictIfNeeded();
    return value;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/** Descarta todas las claves que empiecen por `prefix`. */
export function invalidateCache(prefix: string) {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export const CACHE_TTL = {
  /** Perfil + permisos: corto, para que revocar un permiso surta efecto rápido. */
  session: 30_000,
  /** Marca (logo, color): cambia casi nunca y ya se invalida al guardar. */
  branding: 300_000,
  /** Catálogos de referencia (categorías, marcas, tallas, colores). */
  refs: 120_000,
  /** Si una RPC o columna existe en el esquema. Se recupera solo tras aplicar SQL. */
  capability: 300_000,
} as const;
