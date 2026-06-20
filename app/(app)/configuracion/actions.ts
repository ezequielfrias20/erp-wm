"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

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

export async function updateBrandAsset(
  kind: "logo" | "favicon",
  url: string,
): Promise<FormState> {
  const supabase = await createClient();
  const field = kind === "logo" ? { logo_url: url } : { favicon_url: url };
  const { error } = await supabase.from("settings").update(field).eq("id", 1);
  if (error) return { error: error.message };
  await audit(`Actualizó ${kind === "logo" ? "el logotipo" : "el favicon"}`, "Configuración");
  revalidatePath("/configuracion");
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
  table: "categories" | "sizes" | "colors" | "payment_methods",
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
          : { name: value.trim(), enabled: true };
  const { error } = await supabase.from(table).insert(payload as never);
  if (error) return { error: error.message };
  await audit(`Agregó ${value} a ${table}`, "Configuración");
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteMaster(
  table: "categories" | "sizes" | "colors",
  id: string,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}
