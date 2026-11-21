/**
 * Rutas que el proxy deja pasar sin sesión. Cada ruta se autoriza sola (o no necesita); esto sólo
 * decide si se redirige a /login.
 */
const PUBLIC_PATHS = ["/login", "/invite", "/api/bcv", "/api/keep-alive", "/.well-known"];

/**
 * ¿Es pública? La ruta exacta o algo debajo de ella («/invite/…»), nunca un simple prefijo: así
 * una ruta futura como «/api/keep-alive-admin» no queda pública por accidente.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
