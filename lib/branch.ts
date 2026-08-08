import "server-only";
import { cookies } from "next/headers";
import type { Profile } from "@/lib/database.types";

export const BRANCH_COOKIE = "wm_branch";

export function getProfileBranchScope(
  profile: Pick<Profile, "branch_id" | "role"> | null | undefined,
) {
  if (!profile || profile.role === "Super Admin") return null;
  return profile.branch_id;
}

/**
 * Active branch id for data scoping.
 * A profile branch always wins over the cookie, so branch-bound users cannot
 * escape their assigned branch by changing client state.
 */
export async function getActiveBranchId(
  profileBranchId?: string | null,
  profileRole?: string | null,
): Promise<string | null> {
  if (profileBranchId && profileRole !== "Super Admin") return profileBranchId;
  const store = await cookies();
  const value = store.get(BRANCH_COOKIE)?.value;
  return value && value !== "all" ? value : null;
}
