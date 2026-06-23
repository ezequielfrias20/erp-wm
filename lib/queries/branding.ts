import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Branding = {
  companyName: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
};

const EMPTY: Branding = {
  companyName: null,
  logoUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  primaryColor: null,
  accentColor: null,
};

/** Branding fields, safe for unauthenticated pages (login). Deduped per request. */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("branding").maybeSingle();
    if (!data) return EMPTY;
    return {
      companyName: data.company_name,
      logoUrl: data.logo_url,
      logoDarkUrl: data.logo_dark_url,
      faviconUrl: data.favicon_url,
      primaryColor: data.primary_color,
      accentColor: data.accent_color,
    };
  } catch {
    return EMPTY;
  }
});
