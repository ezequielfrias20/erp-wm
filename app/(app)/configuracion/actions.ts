"use server";

import { revalidatePath } from "next/cache";
import { invalidateBrandingCache } from "@/lib/queries/branding";
import { getSession, invalidateSessionCache } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { storagePathFromPublicUrl } from "@/lib/storage-path";

export type FormState = { error?: string; ok?: boolean } | null;

export async function updateMyProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sesión no válida." };
  const { profile } = session;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: String(formData.get("full_name") ?? "").trim() || profile.full_name,
      phone: String(formData.get("phone") ?? "").trim() || null,
    })
    .eq("id", profile.id);
  if (error) return { error: error.message };
  await audit("Actualizó su perfil", "Configuración");
  invalidateSessionCache(profile.user_id);
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateAvatar(url: string): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sesión no válida." };
  const { profile } = session;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", profile.id);
  if (error) return { error: error.message };
  invalidateSessionCache(profile.user_id);
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export type BrandKind = "logo" | "logo_dark" | "favicon" | "login_image";

const BRAND_COLUMN: Record<
  BrandKind,
  "logo_url" | "logo_dark_url" | "favicon_url" | "login_image_url"
> = {
  logo: "logo_url",
  logo_dark: "logo_dark_url",
  favicon: "favicon_url",
  login_image: "login_image_url",
};

function brandLabel(kind: BrandKind): string {
  const labels: Record<BrandKind, string> = {
    logo: "el logotipo",
    logo_dark: "el logotipo oscuro",
    favicon: "el favicon",
    login_image: "la imagen del login",
  };
  return labels[kind];
}

/** Borra el archivo del bucket. Best-effort: si la URL es rara o RLS lo rechaza, no importa. */
async function removeBrandFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  url: string | null | undefined,
) {
  if (!url) return;
  try {
    const path = storagePathFromPublicUrl(url, "wm-public");
    if (path) await supabase.storage.from("wm-public").remove([path]);
  } catch {
    // ignore
  }
}

export async function updateBrandAsset(kind: BrandKind, url: string): Promise<FormState> {
  const supabase = await createClient();

  // La imagen del login sólo la usa el login: al reemplazarla se borra la anterior (pesa hasta
  // 5 MB). Los logos no: correos ya enviados y la tienda pueden seguir apuntando al archivo.
  let previous: string | null = null;
  if (kind === "login_image") {
    const { data } = await supabase
      .from("settings")
      .select("login_image_url")
      .eq("id", 1)
      .maybeSingle();
    previous = data?.login_image_url ?? null;
  }

  const { data: updated, error } = await supabase
    .from("settings")
    .update({ [BRAND_COLUMN[kind]]: url } as never)
    .eq("id", 1)
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "No tienes permiso para cambiar la marca." };
  if (previous !== url) await removeBrandFile(supabase, previous);
  await audit(`Actualizó ${brandLabel(kind)}`, "Configuración");
  invalidateBrandingCache();
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeBrandAsset(kind: BrandKind): Promise<FormState> {
  const supabase = await createClient();
  const column = BRAND_COLUMN[kind];

  // URL actual, para borrar el archivo del bucket (best-effort).
  const { data: current } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("settings")
    .update({ [column]: null } as never)
    .eq("id", 1)
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "No tienes permiso para cambiar la marca." };

  await removeBrandFile(supabase, current?.[column]);

  await audit(`Eliminó ${brandLabel(kind)}`, "Configuración");
  invalidateBrandingCache();
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateCompany(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      company_name: String(formData.get("company_name") ?? "").trim() || null,
      rif: String(formData.get("rif") ?? "").trim() || null,
      fiscal_address: String(formData.get("fiscal_address") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      taxpayer_type: String(formData.get("taxpayer_type") ?? "").trim() || null,
      iva_retention: formData.get("iva_retention") === "true",
    })
    .eq("id", 1);
  if (error) return { error: error.message };
  await audit("Actualizó datos de la empresa", "Configuración");
  // El nombre sale en el login, el menú y el título de la pestaña.
  invalidateBrandingCache();
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateSales(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      iva_general: Number(formData.get("iva_general") ?? 16),
      currency: String(formData.get("currency") ?? "USD"),
      auto_update_rate: formData.get("auto_update_rate") === "true",
    })
    .eq("id", 1);
  if (error) return { error: error.message };
  await audit("Actualizó parámetros de ventas", "Configuración");
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function updateColors(
  primary: string,
  accent: string,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({ primary_color: primary, accent_color: accent })
    .eq("id", 1);
  if (error) return { error: error.message };
  await audit("Actualizó colores de marca", "Configuración");
  invalidateBrandingCache();
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateNotifications(
  prefs: Record<string, boolean>,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({ notifications: prefs })
    .eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function togglePaymentMethod(
  id: string,
  enabled: boolean,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("payment_methods")
    .update({ enabled })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}
