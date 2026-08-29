import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { ModuleName, Profile } from "@/lib/database.types";
import { MODULES } from "@/lib/database.types";
import { cachedFor, invalidateCache, CACHE_TTL } from "@/lib/server-cache";
import { rpcOrFallback } from "@/lib/db-capabilities";
import { loadJwks, withTimeout, isAuthTimeout } from "@/lib/supabase/jwks";

/**
 * Techo de la verificación de sesión al renderizar. Más holgado que el del proxy
 * (3 s) porque aquí ya estamos dentro de la página: agotarlo degrada, no rompe.
 */
const AUTH_TIMEOUT_MS = 4_000;

export type PermissionMap = Record<ModuleName, number>;

export type SessionData = {
  profile: Profile;
  permissions: PermissionMap;
};

type SessionBootstrap = {
  profile: Profile;
  permissions: Record<string, number>;
} | null;

function emptyPermissions(): PermissionMap {
  return Object.fromEntries(MODULES.map((m) => [m, 0])) as PermissionMap;
}

function toPermissionMap(source: Record<string, number>): PermissionMap {
  const map = emptyPermissions();
  for (const [module, level] of Object.entries(source)) {
    if (module in map) map[module as ModuleName] = Number(level) || 0;
  }
  return map;
}

type AuthClaims = {
  userId: string;
  /** `false` si no se pudo comprobar la firma (JWKS lenta o caída). */
  verified: boolean;
};

/**
 * Id del usuario autenticado, con la verificación acotada en el tiempo.
 *
 * `getClaims()` comprueba la firma del JWT contra las claves públicas del proyecto.
 * Se las pasamos ya resueltas (`loadJwks`, con caché propia y timeout) porque el
 * `fetch` interno de supabase-js al JWKS no tiene límite: cuando ese endpoint se
 * degrada, la petición se queda colgada. Ver `lib/supabase/jwks.ts`.
 */
async function readAuthClaims(): Promise<AuthClaims | null> {
  // Sin cookie de sesión no hay token que verificar: nos ahorramos JWKS y `getClaims()`.
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasAuthCookie) return null;

  const supabase = await createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const jwks = supabaseUrl
    ? await loadJwks(supabaseUrl)
    : ({ status: "unreachable" } as const);

  if (jwks.status !== "unreachable") {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.getClaims(
          undefined,
          jwks.status === "ok" ? { jwks: jwks.jwks } : undefined,
        ),
        AUTH_TIMEOUT_MS,
      );
      if (error || !data?.claims?.sub) return null;
      return { userId: String(data.claims.sub), verified: true };
    } catch (error) {
      if (!isAuthTimeout(error)) return null;
    }
  }

  // Sin firma verificada sólo miramos la cookie, que no es de fiar. Sirve para
  // saber que hay *alguna* sesión y seguir adelante; quién es de verdad lo decide
  // `session_bootstrap` bajo RLS, con el JWT que Postgres sí verifica.
  // También acotado: si el token está vencido, `getSession()` sale a refrescarlo.
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS);
    const sub = data.session?.user?.id;
    return sub ? { userId: sub, verified: false } : null;
  } catch {
    return null;
  }
}

/** Id del usuario autenticado, o `null`. */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const claims = await readAuthClaims();
  return claims?.verified ? claims.userId : null;
}

/** Perfil + permisos en una sola llamada (`wm.session_bootstrap`). */
async function loadSession(): Promise<SessionData | null> {
  const supabase = await createClient();

  const bootstrap = await rpcOrFallback<SessionBootstrap>(
    "session_bootstrap",
    async () => {
      const { data, error } = await supabase.rpc("session_bootstrap");
      return { data: (data ?? null) as SessionBootstrap, error };
    },
    // Respaldo mientras session_bootstrap.sql no esté aplicado: dos viajes en serie.
    async () => {
      const { data: profile, error } = await supabase.rpc("claim_profile");
      if (error || !profile || (profile as Profile).id == null) return null;
      const { data: rows } = await supabase
        .from("role_permissions")
        .select("module, level")
        .eq("role", (profile as Profile).role);
      const permissions: Record<string, number> = {};
      for (const row of rows ?? []) permissions[row.module] = row.level;
      return { profile: profile as Profile, permissions };
    },
  );

  if (!bootstrap?.profile?.id) return null;
  if (bootstrap.profile.system_access === false) return null;

  return {
    profile: bootstrap.profile,
    permissions: toPermissionMap(bootstrap.permissions ?? {}),
  };
}

async function resolveSession(): Promise<SessionData | null> {
  const auth = await readAuthClaims();
  if (!auth) return null;
  // Con la firma sin verificar no cacheamos por `sub`: una cookie falsificada
  // envenenaría la entrada de otro usuario. Pagamos el viaje completo, que va
  // por RLS y por tanto es seguro.
  if (!auth.verified) return loadSession();
  return cachedFor(`session:${auth.userId}`, CACHE_TTL.session, loadSession);
}

/**
 * Sesión del ERP. `cache()` deduplica dentro de la petición; `cachedFor` evita
 * repetir el viaje a Supabase entre navegaciones (TTL corto, ver server-cache).
 */
export const getSession = cache(resolveSession);

/** Invalida el perfil/permisos memorizados. Llamar tras editar usuarios o permisos. */
export function invalidateSessionCache(userId?: string | null) {
  invalidateCache(userId ? `session:${userId}` : "session:");
}
