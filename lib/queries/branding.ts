import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { cachedFor, invalidateCache, CACHE_TTL } from "@/lib/server-cache";

const BRANDING_KEY = "branding";

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

async function loadBranding(): Promise<Branding> {
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
}

/**
 * Campos de marca, seguros para páginas sin autenticar (login).
 *
 * `cache()` deduplica dentro de la petición (el root layout la pide en
 * `generateMetadata` y en el render). `cachedFor` evita repetir la RPC —0.45 s
 * medidos— en cada navegación, para datos que cambian una vez al año. Las acciones
 * de Configuración llaman a `invalidateBrandingCache()`.
 */
export const getBranding = cache(
  (): Promise<Branding> =>
    cachedFor(BRANDING_KEY, CACHE_TTL.branding, loadBranding),
);

export function invalidateBrandingCache() {
  invalidateCache(BRANDING_KEY);
}
