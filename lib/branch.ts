import "server-only";
import { cookies } from "next/headers";

export const BRANCH_COOKIE = "wm_branch";

/** Active branch id from the cookie, or null when "all branches" is selected. */
export async function getActiveBranchId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(BRANCH_COOKIE)?.value;
  return value && value !== "all" ? value : null;
}
