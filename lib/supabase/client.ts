import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

/** Browser Supabase client. Points at the `wm` schema (ERP tables). */
export function createClient() {
  return createBrowserClient<Database, "wm">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "wm" } },
  );
}
