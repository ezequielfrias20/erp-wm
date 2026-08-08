import "server-only";
import { cookies } from "next/headers";

export const BRANCH_COOKIE = "wm_branch";

/**
 * Active branch id for data scoping.
 * A profile branch always wins over the cookie, so branch-bound users cannot
 * escape their assigned branch by changing client state.
 */
export async function getActiveBranchId(
  profileBranchId?: string | null,
): Promise<string | null> {
  if (profileBranchId) return profileBranchId;
  const store = await cookies();
  const value = store.get(BRANCH_COOKIE)?.value;
  return value && value !== "all" ? value : null;
}
