import { DEFAULT_TEMPLATES, type TemplateKey } from "./whatsapp";

export type OnlineSettingsInput = {
  softHoldMinutes: number;
  firmHoldHours: number;
  storeWhatsapp: string | null;
  templates: Partial<Record<TemplateKey, string>>;
};

export function validateOnlineSettings(input: OnlineSettingsInput): string | null {
  if (!input || !Number.isInteger(input.softHoldMinutes) || input.softHoldMinutes < 5 || input.softHoldMinutes > 240) {
    return "El apartado corto debe estar entre 5 y 240 minutos";
  }
  if (!Number.isInteger(input.firmHoldHours) || input.firmHoldHours < 1 || input.firmHoldHours > 168) {
    return "El apartado firme debe estar entre 1 y 168 horas";
  }
  if (input.storeWhatsapp !== null && typeof input.storeWhatsapp !== "string") {
    return "El WhatsApp de la tienda debe ir en formato +58…";
  }
  if (input.storeWhatsapp?.trim() && !/^\+[1-9][0-9]{7,14}$/.test(input.storeWhatsapp.trim())) {
    return "El WhatsApp de la tienda debe ir en formato +58…";
  }
  if (!input.templates || typeof input.templates !== "object" || Array.isArray(input.templates)) {
    return "Las plantillas de WhatsApp no son válidas.";
  }
  for (const [key, value] of Object.entries(input.templates)) {
    if (!Object.hasOwn(DEFAULT_TEMPLATES, key) || typeof value !== "string") {
      return "Las plantillas de WhatsApp no son válidas.";
    }
    if (value.length > 1000) return "Las plantillas no pueden superar 1000 caracteres.";
  }
  return null;
}
