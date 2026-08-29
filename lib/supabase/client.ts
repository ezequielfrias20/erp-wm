import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { supabaseFetch } from "@/lib/supabase/fetch";

/** Browser Supabase client. Points at the `wm` schema (ERP tables). */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Faltan variables públicas de Supabase.");
  }

  return createBrowserClient<Database, "wm">(
    supabaseUrl,
    supabaseKey,
    { db: { schema: "wm" }, global: { fetch: supabaseFetch } },
  );
}
