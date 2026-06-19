"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { BRANCH_COOKIE } from "@/lib/branch";

/** Persists the active branch selection (id or "all") for the whole app. */
export async function setActiveBranch(id: string) {
  const store = await cookies();
  store.set(BRANCH_COOKIE, id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
