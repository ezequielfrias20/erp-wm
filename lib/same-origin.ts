/**
 * ¿La petición viene de nuestra propia página?
 *
 * Las Server Actions comprueban el origen por su cuenta; un Route Handler no. El
 * cobro cambia estado (graba una venta, descuenta inventario) y viaja con la cookie
 * de sesión, así que sin esta comprobación bastaría con que un cajero con la sesión
 * abierta visitara otra página para que ésta pudiera registrarle ventas.
 *
 * Se compara el `Origin` contra el host real de la petición: detrás de un proxy el
 * host de confianza llega en `X-Forwarded-Host`, y `Host` puede ser el interno.
 */
export function isSameOrigin(headers: {
  origin: string | null;
  host: string | null;
  forwardedHost?: string | null;
}): boolean {
  const { origin, host, forwardedHost } = headers;
  // Los navegadores mandan `Origin` en toda petición con método que cambia estado.
  // Su ausencia no es un caso legítimo desde el navegador: se rechaza.
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const permitidos = [forwardedHost, host].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return permitidos.includes(originHost);
}
