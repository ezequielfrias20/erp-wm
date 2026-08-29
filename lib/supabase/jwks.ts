/**
 * Caché propia del JWKS de Supabase Auth, con límite de tiempo.
 *
 * `supabase.auth.getClaims()` verifica la firma del JWT contra las claves públicas
 * del proyecto (`/auth/v1/.well-known/jwks.json`). Ese `fetch` lo hace supabase-js
 * por dentro **sin timeout ni AbortSignal**, y sólo lo cachea 10 minutos por isolate.
 * Si el endpoint se degrada —medido en producción: 10,9 s en el mejor caso y sin
 * respuesta en el resto— cada petición que toca ese camino se queda colgada. En el
 * proxy eso significa que Vercel mata la invocación: `MIDDLEWARE_INVOCATION_TIMEOUT`
 * (504) justo al cobrar una venta.
 *
 * Aquí resolvemos las claves nosotros y se las pasamos ya hechas a `getClaims()`,
 * que entonces no toca la red (`fetchJwk` devuelve del `jwks` recibido). Tres capas:
 *
 * 1. `SUPABASE_AUTH_JWKS` en el entorno → cero red, siempre.
 * 2. Caché de proceso con *stale-while-revalidate*: pasados 10 minutos seguimos
 *    sirviendo las claves viejas y refrescamos de fondo. Las claves de firma rotan
 *    muy de vez en cuando, así que servir una copia rancia es correcto — y si el
 *    `kid` del token no está entre ellas, supabase-js hace su propio viaje (acotado
 *    por `withTimeout` en quien llama).
 * 3. Descarga con `AbortSignal.timeout`, para que un arranque en frío con el
 *    endpoint caído falle en 2,5 s en vez de colgarse.
 */

/** Forma estructural de una clave JWK (supabase-js no reexporta su tipo `JWK`). */
export type JwkKey = {
  kty: string;
  /** Requerido por el tipo `JWK` de supabase-js; el JWKS de Supabase lo trae siempre. */
  key_ops: string[];
  alg?: string;
  kid?: string;
  [key: string]: unknown;
};

export type JwkSet = { keys: JwkKey[] };

/**
 * Resultado de resolver las claves. Distinguir "no hay claves asimétricas" de
 * "Auth no responde" importa: en el primer caso `getClaims()` debe seguir su
 * camino normal (cae a `getUser()`, que es lo correcto para un proyecto HS256);
 * en el segundo no tiene sentido intentarlo — sólo sumaría otro plantón.
 */
export type JwksResult =
  | { status: "ok"; jwks: JwkSet }
  | { status: "absent" }
  | { status: "unreachable" };

/** Pasado este tiempo las claves se consideran rancias y se refrescan de fondo. */
const REFRESH_AFTER_MS = 10 * 60_000;
/** Techo de la descarga del JWKS. */
const FETCH_TIMEOUT_MS = 2_500;
/** Tras un fallo, no reintentar hasta pasado esto (evita martillear un endpoint caído). */
const RETRY_AFTER_FAILURE_MS = 30_000;

type CacheEntry = { keys: JwkKey[]; fetchedAt: number };
type Failure = "absent" | "unreachable";

// Estado a nivel de módulo: se comparte entre peticiones del mismo isolate.
let cached: CacheEntry | null = null;
let inFlight: Promise<JwkKey[] | null> | null = null;
let lastFailureAt = 0;
let lastFailureKind: Failure = "unreachable";

/** Sólo para tests. */
export function resetJwksCache() {
  cached = null;
  inFlight = null;
  lastFailureAt = 0;
  lastFailureKind = "unreachable";
}

function parseKeys(raw: unknown): JwkKey[] | null {
  const list = Array.isArray(raw)
    ? raw
    : (raw as JwkSet | null)?.keys;
  if (!Array.isArray(list) || list.length === 0) return null;
  const keys = list
    .filter(
      (key): key is Record<string, unknown> =>
        typeof key === "object" && key !== null && typeof key.kty === "string",
    )
    .map((key): JwkKey => ({
      ...key,
      kty: key.kty as string,
      key_ops: Array.isArray(key.key_ops) ? (key.key_ops as string[]) : ["verify"],
    }));
  return keys.length ? keys : null;
}

/** Claves precargadas por entorno. Evita el viaje de red por completo. */
function keysFromEnv(): JwkKey[] | null {
  const raw = process.env.SUPABASE_AUTH_JWKS;
  if (!raw) return null;
  try {
    return parseKeys(JSON.parse(raw));
  } catch {
    // Un JSON mal puesto no debe tumbar la autenticación: caemos a la descarga.
    return null;
  }
}

/** Marca de "el proyecto no publica claves asimétricas" (respuesta 4xx del endpoint). */
class JwksAbsentError extends Error {}

async function fetchJwks(supabaseUrl: string): Promise<JwkKey[] | null> {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  // El servidor contestó: no publica JWKS. Es una respuesta, no una caída.
  if (res.status >= 400 && res.status < 500) throw new JwksAbsentError();
  if (!res.ok) return null;
  return parseKeys(await res.json());
}

function refresh(supabaseUrl: string): Promise<JwkKey[] | null> {
  if (inFlight) return inFlight;

  inFlight = fetchJwks(supabaseUrl)
    .then((keys) => {
      if (keys) {
        cached = { keys, fetchedAt: Date.now() };
        lastFailureAt = 0;
      } else {
        lastFailureAt = Date.now();
        lastFailureKind = "unreachable";
      }
      return keys;
    })
    .catch((error) => {
      lastFailureAt = Date.now();
      lastFailureKind =
        error instanceof JwksAbsentError ? "absent" : "unreachable";
      return null;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Claves de firma del proyecto, listas para pasar a `getClaims(jwt, { jwks })`.
 * Nunca tarda más de `FETCH_TIMEOUT_MS`.
 */
export async function loadJwks(supabaseUrl: string): Promise<JwksResult> {
  const fromEnv = keysFromEnv();
  if (fromEnv) return { status: "ok", jwks: { keys: fromEnv } };

  const now = Date.now();

  if (cached) {
    const stale = now - cached.fetchedAt >= REFRESH_AFTER_MS;
    const cooling = now - lastFailureAt < RETRY_AFTER_FAILURE_MS;
    // Rancias pero utilizables: se sirven ya y el refresco va por detrás.
    if (stale && !cooling) void refresh(supabaseUrl);
    return { status: "ok", jwks: { keys: cached.keys } };
  }

  // Ventana de enfriamiento: repetimos el veredicto sin volver a salir a la red.
  if (now - lastFailureAt < RETRY_AFTER_FAILURE_MS) return { status: lastFailureKind };

  const keys = await refresh(supabaseUrl);
  if (keys) return { status: "ok", jwks: { keys } };
  return { status: lastFailureKind };
}

export class AuthTimeoutError extends Error {
  constructor(ms: number) {
    super(`La verificación de sesión superó ${ms} ms.`);
    this.name = "AuthTimeoutError";
  }
}

export function isAuthTimeout(error: unknown): boolean {
  return error instanceof AuthTimeoutError;
}

/**
 * Techo duro para una promesa. No cancela el trabajo de fondo (supabase-js no
 * expone un `AbortSignal` en `getClaims`), sólo deja de esperarlo: lo que importa
 * es que la petición se responda en vez de morir en el timeout de la plataforma.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthTimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
