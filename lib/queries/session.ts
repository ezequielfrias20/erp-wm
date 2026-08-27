import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ModuleName, Profile } from "@/lib/database.types";
import { MODULES } from "@/lib/database.types";
import { cachedFor, invalidateCache, CACHE_TTL } from "@/lib/server-cache";
import { rpcOrFallback } from "@/lib/db-capabilities";

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

/**
 * Id del usuario autenticado.
 *
 * `getClaims()` verifica la firma del JWT en local contra la JWKS del proyecto
 * (claves asimétricas ES256), así que no hay viaje de red. `getUser()`, que es lo
 * que había antes, siempre golpeaba `/auth/v1/user`: ~200 ms por petición, y se
 * llamaba dos veces por navegación (proxy + página). Si el proyecto usara todavía
 * el secreto simétrico HS256, supabase-js cae solo a `getUser()`.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
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
  const userId = await getAuthenticatedUserId();
  if (!userId) return null;
  return cachedFor(`session:${userId}`, CACHE_TTL.session, loadSession);
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
