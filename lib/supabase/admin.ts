import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Admin client for trusted server-only routes. Do not use this in SSR clients:
 * cookie-aware clients can replace the authorization header with a user session.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("La conexión privada del servidor no está configurada.");
  }

  return createClient<Database, "wm">(url, key, {
    db: { schema: "wm" },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
