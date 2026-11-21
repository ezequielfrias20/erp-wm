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
  // Vacía o sólo espacios cuenta como no definida; si no, se compara el valor tal cual, que es
  // lo que Vercel Cron pone en el header.
  if (!secret?.trim()) return true;
  if (!authorization) return false;

  const given = Buffer.from(authorization);
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length) return false;
  return timingSafeEqual(given, wanted);
}

/** Estado del último latido para el indicador de Configuración. */
export function heartbeatStatus(lastBeatAt: string | null, now: number = Date.now()): "ok" | "stale" | "never" {
  if (!lastBeatAt) return "never";
  return now - new Date(lastBeatAt).getTime() > STALE_AFTER_MS ? "stale" : "ok";
}
