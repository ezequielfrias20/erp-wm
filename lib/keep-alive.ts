import { timingSafeEqual } from "node:crypto";

/** Más de este tiempo sin latido y Configuración avisa: el cron de Vercel corre a diario. */
export const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * ¿Puede esta petición disparar el latido?
 *
 * Sin `CRON_SECRET` (o vacía) la ruta queda abierta a propósito: un negocio nuevo funciona sin
 * configurar nada, y es inofensiva porque `wm.keep_alive()` escribe como máximo una vez por hora
 * y la ruta no devuelve datos. Con `CRON_SECRET` se exige el header que manda Vercel Cron:
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export function isKeepAliveAuthorized(authorization: string | null, secret: string | undefined): boolean {
  // Vacía o sólo espacios cuenta como no definida. Se compara recortada porque HTTP quita los
  // espacios de los extremos del valor de un header: un CRON_SECRET guardado con salto de línea
  // final llega como «Bearer <secreto>» y, sin recortar, rechazaría todos los latidos.
  const expected = secret?.trim();
  if (!expected) return true;
  if (!authorization) return false;

  const given = Buffer.from(authorization);
  const wanted = Buffer.from(`Bearer ${expected}`);
  if (given.length !== wanted.length) return false;
  return timingSafeEqual(given, wanted);
}

/**
 * Causa de un fallo del latido para el log del servidor (Vercel → Logs): el código de PostgREST o
 * el mensaje del error. La respuesta HTTP sigue siendo genérica; esto nunca sale al cliente.
 */
export function keepAliveErrorSummary(error: unknown): string {
  if (!error || typeof error !== "object") return "error desconocido";
  const { code, message } = error as { code?: unknown; message?: unknown };
  const text = typeof message === "string" ? message : "";
  const summary = typeof code === "string" && code ? `${code}: ${text}` : text;
  return summary ? summary.slice(0, 200) : "error desconocido";
}

/** Estado del último latido para el indicador de Configuración. */
export function heartbeatStatus(lastBeatAt: string | null, now: number = Date.now()): "ok" | "stale" | "never" {
  if (!lastBeatAt) return "never";
  return now - new Date(lastBeatAt).getTime() > STALE_AFTER_MS ? "stale" : "ok";
}
