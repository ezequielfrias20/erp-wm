"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { storagePathFromPublicUrl } from "@/lib/storage-path";

export type FormState = { error?: string; ok?: boolean } | null;

export async function updateMyProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const { data: profile } = await supabase.rpc("claim_profile");
  if (!profile) return { error: "Sesión no válida." };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: String(formData.get("full_name") ?? "").trim() || profile.full_name,
      phone: String(formData.get("phone") ?? "").trim() || null,
    })
    .eq("id", profile.id);
  if (error) return { error: error.message };
  await audit("Actualizó su perfil", "Configuración");
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateAvatar(url: string): Promise<FormState> {
  const supabase = await createClient();
  const { data: profile } = await supabase.rpc("claim_profile");
  if (!profile) return { error: "Sesión no válida." };
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

type BrandKind = "logo" | "logo_dark" | "favicon";

const BRAND_COLUMN: Record<BrandKind, "logo_url" | "logo_dark_url" | "favicon_url"> = {
  logo: "logo_url",
  logo_dark: "logo_dark_url",
  favicon: "favicon_url",
};

function brandLabel(kind: BrandKind): string {
  return kind === "logo"
    ? "el logotipo"
    : kind === "logo_dark"
      ? "el logotipo oscuro"
      : "el favicon";
}

export async function updateBrandAsset(kind: BrandKind, url: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({ [BRAND_COLUMN[kind]]: url } as never)
    .eq("id", 1);
  if (error) return { error: error.message };
  await audit(`Actualizó ${brandLabel(kind)}`, "Configuración");
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
    .select("logo_url, logo_dark_url, favicon_url")
    .eq("id", 1)
    .maybeSingle();

  const { error } = await supabase
    .from("settings")
    .update({ [column]: null } as never)
    .eq("id", 1);
  if (error) return { error: error.message };

  const url = current?.[column] ?? null;
  if (url) {
    // Best-effort: si la URL es rara o RLS rechaza el borrado, la columna ya quedó limpia.
    try {
      const path = storagePathFromPublicUrl(url, "wm-public");
      if (path) await supabase.storage.from("wm-public").remove([path]);
    } catch {
      // ignore
    }
  }

  await audit(`Eliminó ${brandLabel(kind)}`, "Configuración");
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
  revalidatePath("/configuracion");
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
  revalidatePath("/configuracion");
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

export async function addMaster(
  table: "categories" | "sizes" | "colors" | "brands" | "payment_methods",
  value: string,
): Promise<FormState> {
  if (!value.trim()) return { error: "Valor vacío." };
  const supabase = await createClient();
  const payload =
    table === "categories"
      ? { name: value.trim(), color: "#0EA5E9" }
      : table === "sizes"
        ? { label: value.trim() }
        : table === "colors"
          ? { name: value.trim(), hex: "#0EA5E9" }
          : table === "brands"
            ? { name: value.trim(), is_active: true }
            : { name: value.trim(), enabled: true };
  const { error } = await supabase.from(table).insert(payload as never);
  if (error) return { error: error.message };
  await audit(`Agregó ${value} a ${table}`, "Configuración");
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteMaster(
  table: "categories" | "sizes" | "colors" | "brands",
  id: string,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}
