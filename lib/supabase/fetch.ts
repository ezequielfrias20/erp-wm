/**
 * `fetch` con techo de tiempo para todas las llamadas a Supabase.
 *
 * Ni supabase-js ni `@supabase/ssr` ponen límite a sus peticiones: si el servicio
 * deja de responder (no rechaza — simplemente no contesta), la promesa no termina
 * nunca. En el servidor eso significa una función colgada hasta que la plataforma
 * la mata, y para el usuario una página que se queda pensando sin llegar a ningún
 * sitio. Supabase Auth se degradó así en producción: `/auth/v1/*` sin respuesta
 * durante minutos mientras `/rest/v1/` seguía contestando en 0,2 s.
 *
 * El techo se elige por la URL de la petición:
 *
 * - **Auth** (`/auth/v1/…`): iniciar sesión, refrescar el token o descargar el JWKS
 *   deberían tardar centenares de milisegundos. Un plazo corto convierte una caída
 *   en un error inmediato y accionable en vez de en un cuelgue.
 * - **Datos** (PostgREST, Storage, RPC): plazo amplio. Aquí sí hay operaciones
 *   legítimamente lentas —reportes por rango largo, cargas masivas de Excel— y
 *   cortarlas sería peor que el problema. El límite existe sólo para que una
 *   conexión muerta no se eternice.
 */

/** Iniciar sesión, refrescar token, JWKS. */
export const AUTH_TIMEOUT_MS = 8_000;
/** Consultas, RPC, Storage. Holgado a propósito: hay operaciones pesadas legítimas. */
export const DATA_TIMEOUT_MS = 30_000;

/** Plazo que corresponde a una URL. Exportada para poder probarla directamente:
 *  `AbortSignal.timeout` usa temporizadores nativos que los tests no pueden avanzar. */
export function timeoutFor(input: RequestInfo | URL): number {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return url.includes("/auth/v1/") ? AUTH_TIMEOUT_MS : DATA_TIMEOUT_MS;
}

/** Une la señal de quien llama con la del plazo, sin perder ninguna de las dos. */
function combineSignals(caller: AbortSignal | null | undefined, timeout: AbortSignal) {
  if (!caller) return timeout;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([caller, timeout]);
  }
  const controller = new AbortController();
  const abort = (reason: unknown) => controller.abort(reason);
  for (const signal of [caller, timeout]) {
    if (signal.aborted) {
      abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/**
 * `fetch` para pasar a `createClient({ global: { fetch } })`. Acota cada petición
 * y deja intacto el resto del comportamiento.
 */
export const supabaseFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(timeoutFor(input));
  return fetch(input, { ...init, signal: combineSignals(init?.signal, timeout) });
};

/**
 * ¿Es un fallo de transporte (red caída, plazo agotado) y no una credencial mala?
 *
 * La distinción decide si al usuario se le cierra la sesión o no. supabase-js
 * devuelve `AuthRetryableFetchError` cuando la petición no llegó a completarse;
 * confundirlo con "token inválido" convertiría una caída de Auth en un cierre de
 * sesión masivo.
 */
export function isTransportFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; message?: string; status?: number };
  if (e.name === "AuthRetryableFetchError") return true;
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  const message = e.message?.toLowerCase() ?? "";
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("aborted") ||
    message.includes("timeout")
  );
}
