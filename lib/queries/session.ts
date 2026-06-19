import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ModuleName, Profile } from "@/lib/database.types";
import { MODULES } from "@/lib/database.types";

export type PermissionMap = Record<ModuleName, number>;

export type SessionData = {
  profile: Profile;
  permissions: PermissionMap;
};

/**
 * Resolves the current ERP profile for the authenticated user, linking an invited
 * profile by email on first login (via the SECURITY DEFINER `claim_profile` RPC).
 * Returns null when there is no session or the user has no active ERP profile.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("claim_profile");
  if (error || !data) return null;
  return data as Profile;
}

export async function getMyPermissions(role: string): Promise<PermissionMap> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("role_permissions")
    .select("module, level")
    .eq("role", role);

  const map = Object.fromEntries(MODULES.map((m) => [m, 0])) as PermissionMap;
  for (const row of data ?? []) {
    if (row.module in map) map[row.module as ModuleName] = row.level;
  }
  return map;
}

export async function getSession(): Promise<SessionData | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const permissions = await getMyPermissions(profile.role);
  return { profile, permissions };
}
