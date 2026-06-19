import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { VBranchStats } from "@/lib/database.types";

/** Branch cards with computed month sales + inventory units + manager. */
export async function getBranchStats(): Promise<VBranchStats[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_branch_stats")
    .select("*")
    .order("month_sales", { ascending: false });
  return data ?? [];
}
