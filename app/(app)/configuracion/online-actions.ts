"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { isUuid } from "@/lib/online-orders/rules";
import { validateOnlineSettings, type OnlineSettingsInput } from "@/lib/online-orders/settings";
import { DEFAULT_TEMPLATES, type TemplateKey } from "@/lib/online-orders/whatsapp";
import { canEdit, canView } from "@/lib/permissions";
import { getOnlineSettings } from "@/lib/queries/online-orders";
import { getSession } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";

export type OnlineStoreConfig = {
  settings: Awaited<ReturnType<typeof getOnlineSettings>>;
  templateOverrides: Partial<Record<TemplateKey, string>>;
  branches: { id: string; name: string; city: string; isActive: boolean; onlineEnabled: boolean }[];
  canEditSettings: boolean;
  canEditBranches: boolean;
};

function revalidateOnlineConfig() {
  revalidatePath("/configuracion");
  revalidatePath("/pedidos-online");
}

/** Datos de Configuración → Tienda online bajo demanda. */
export async function loadOnlineStoreConfig(): Promise<{ data?: OnlineStoreConfig; error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." };
  if (!canView(session.permissions, "Configuración")) {
    return { error: "No tienes permiso para ver la configuración." };
  }
  try {
    const db = await createClient();
    const [settingsRes, branchesRes] = await Promise.all([
      db.from("online_settings").select("soft_hold_minutes, firm_hold_hours, store_whatsapp, whatsapp_templates")
        .eq("id", 1).single(),
      db.from("branches").select("id, name, city, is_active, online_enabled").order("name"),
    ]);
    if (settingsRes.error || branchesRes.error || !settingsRes.data) {
      return { error: "No se pudo cargar la configuración de la tienda online." };
    }

    const rawTemplates = settingsRes.data.whatsapp_templates ?? {};
    const templateOverrides: Partial<Record<TemplateKey, string>> = {};
    for (const key of Object.keys(DEFAULT_TEMPLATES) as TemplateKey[]) {
      const value = rawTemplates[key];
      if (typeof value === "string" && value.trim()) templateOverrides[key] = value;
    }
    // getOnlineSettings aplica la misma combinación de plantillas usada en pedidos.
    // La lectura directa cubre perfiles con Configuración 1 y sin acceso a Ventas.
    const settings = canEdit(session.permissions, "Configuración") || canView(session.permissions, "Ventas")
      ? await getOnlineSettings()
      : {
          softHoldMinutes: Number(settingsRes.data.soft_hold_minutes),
          firmHoldHours: Number(settingsRes.data.firm_hold_hours),
          storeWhatsapp: settingsRes.data.store_whatsapp,
          templates: { ...DEFAULT_TEMPLATES, ...templateOverrides },
        };
    return {
      data: {
        settings,
        templateOverrides,
        branches: (branchesRes.data ?? []).map((branch) => ({
          id: branch.id,
          name: branch.name,
          city: branch.city,
          isActive: branch.is_active,
          onlineEnabled: branch.online_enabled,
        })),
        canEditSettings: canEdit(session.permissions, "Configuración"),
        canEditBranches: canEdit(session.permissions, "Sucursales"),
      },
    };
  } catch {
    return { error: "No se pudo cargar la configuración de la tienda online." };
  }
}

export async function saveOnlineSettings(input: OnlineSettingsInput): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session || !canEdit(session.permissions, "Configuración")) {
    return { error: "No tienes permiso para editar la configuración de la tienda online." };
  }
  const invalid = validateOnlineSettings(input);
  if (invalid) return { error: invalid };
  const templates: Partial<Record<TemplateKey, string>> = {};
  for (const key of Object.keys(DEFAULT_TEMPLATES) as TemplateKey[]) {
    const value = input.templates[key]?.trim();
    if (value) templates[key] = value;
  }
  try {
    const db = await createClient();
    const { data, error } = await db.from("online_settings").update({
      soft_hold_minutes: input.softHoldMinutes,
      firm_hold_hours: input.firmHoldHours,
      store_whatsapp: input.storeWhatsapp?.trim() || null,
      whatsapp_templates: templates,
    }).eq("id", 1).select("id").maybeSingle();
    if (error || !data) return { error: "No se pudo guardar la configuración de la tienda online." };
    await audit("Actualizó la configuración de la tienda online", "Configuración");
    revalidateOnlineConfig();
    return {};
  } catch {
    return { error: "No se pudo guardar la configuración de la tienda online." };
  }
}

export async function setBranchOnline(branchId: string, enabled: boolean): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session || !canEdit(session.permissions, "Sucursales")) {
    return { error: "No tienes permiso para editar sucursales." };
  }
  if (!isUuid(branchId) || typeof enabled !== "boolean") return { error: "Sucursal no válida." };
  try {
    const db = await createClient();
    const { data, error } = await db.from("branches").update({ online_enabled: enabled })
      .eq("id", branchId).eq("is_active", true).select("id").maybeSingle();
    if (error || !data) return { error: "No se pudo actualizar la sucursal. Comprueba que esté activa." };
    await audit(`${enabled ? "Activó" : "Desactivó"} la venta online en una sucursal`, "Sucursales");
    revalidateOnlineConfig();
    return {};
  } catch {
    return { error: "No se pudo actualizar la sucursal." };
  }
}
