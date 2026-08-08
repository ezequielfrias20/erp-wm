"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { BRANCH_COOKIE, getProfileBranchScope } from "@/lib/branch";
import { getSession } from "@/lib/queries/session";

/** Persists the active branch selection (id or "all") for the whole app. */
export async function setActiveBranch(id: string) {
  const session = await getSession();
  const assignedBranchId = getProfileBranchScope(session?.profile);
  const nextId = assignedBranchId ?? id;

  const store = await cookies();
  store.set(BRANCH_COOKIE, nextId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
