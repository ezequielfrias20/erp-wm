"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { invalidateSessionCache } from "@/lib/queries/session";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";
import { getSession } from "@/lib/queries/session";
import {
  buildUserInviteEmailHtml,
  buildUserInviteEmailText,
} from "@/lib/user-invite-email";
import type { Profile, Role, UserStatus } from "@/lib/database.types";

export type FormState =
  | {
      error?: string;
      ok?: boolean;
      message?: string;
      warning?: string;
      employeeCode?: string;
    }
  | null;

type UserAccessEmailProfile = Pick<
  Profile,
  "id" | "full_name" | "role" | "branch_id"
> & { email: string };

async function assertCanManageUsers() {
  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." as const };
  if (!canEdit(session.permissions, "Usuarios")) {
    return { error: "No tienes permiso para gestionar usuarios." as const };
  }
  return { session };
}

async function appOrigin() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto.split(",")[0]}://${host}`;
}

async function getBranchName(branchId: string | null) {
  if (!branchId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("city")
    .eq("id", branchId)
    .maybeSingle();
  return data?.city ?? null;
}

async function getEmailBranding() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("branding").maybeSingle();
  return {
    companyName: data?.company_name ?? "World Medics",
    logoUrl: data?.logo_url ?? data?.logo_dark_url ?? null,
    primaryColor: data?.primary_color ?? "#0EA5E9",
  };
}

async function sendUserAccessEmail(profile: UserAccessEmailProfile) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    throw new Error("Configura RESEND_API_KEY y RESEND_FROM para enviar invitaciones.");
  }

  const origin = await appOrigin();
  const branchName = await getBranchName(profile.branch_id);
  const branding = await getEmailBranding();
  const inviteUrl = `${origin}/invite?email=${encodeURIComponent(profile.email)}`;
  const loginUrl = `${origin}/login`;
  const input = {
    companyName: branding.companyName,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    branchName,
    inviteUrl,
    loginUrl,
    primaryColor: branding.primaryColor,
    logoUrl: branding.logoUrl,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    // Sin plazo, un Resend que no responda deja la acción colgada indefinidamente.
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [profile.email],
      subject: `Invitación al ERP · ${branding.companyName}`,
      html: buildUserInviteEmailHtml(input),
      text: buildUserInviteEmailText(input),
      tags: [
        { name: "module", value: "usuarios" },
        { name: "type", value: "user_invite" },
      ],
    }),
  });

  const payload = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) {
    throw new Error(payload?.message ?? `Resend respondió ${res.status}.`);
  }
}

async function generateUniqueEmployeeCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  excludeId?: string,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const code = randomInt(0, 10_000).toString().padStart(4, "0");
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("employee_code", code)
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingSalesCommissionColumn(error)) {
        throw new Error(employeeCodeMigrationMessage);
      }
      throw error;
    }
    if (!data || data.id === excludeId) return code;
  }
  throw new Error("No se pudo generar un código único de vendedor.");
}

const employeeCodeMigrationMessage =
  "Falta aplicar la actualización de comisiones en Supabase. Ejecuta supabase/sales_commissions.sql y vuelve a intentar.";

function isMissingSalesCommissionColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code !== "42703" || typeof candidate.message !== "string") return false;
  const message = candidate.message;
  return (
    ["employee_code", "system_access", "commission_pct", "seller_commission_pct"].some((column) =>
      message.includes(column),
    )
  );
}

function databaseErrorMessage(error: unknown) {
  if (isMissingSalesCommissionColumn(error)) return employeeCodeMigrationMessage;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Ocurrió un error inesperado.";
}

function isFourDigitCode(value: string | null | undefined) {
  return /^\d{4}$/.test(value ?? "");
}

function parseCommissionPct(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "2").trim().replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

export async function saveUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await assertCanManageUsers();
  if ("error" in access) return { error: access.error };

  const id = String(formData.get("id") ?? "").trim();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const system_access = formData.get("system_access") === "on";
  if (!full_name) {
    return { error: "El nombre es obligatorio." };
  }
  if (system_access && !email) {
    return { error: "El correo es obligatorio cuando el perfil tendrá acceso al sistema." };
  }

  const branchVal = String(formData.get("branch_id") ?? "").trim();
  const role = String(formData.get("role") ?? "Vendedor") as Role;
  if (role === "Super Admin" && access.session.profile.role !== "Super Admin") {
    return { error: "Solo un Super Admin puede crear o asignar otro Super Admin." };
  }
  const commission_pct =
    role === "Vendedor" ? parseCommissionPct(formData.get("commission_pct")) : 0;
  if (commission_pct == null) {
    return { error: "La comisión del vendedor debe estar entre 0% y 100%." };
  }
  const supabase = await createClient();

  const baseValues = {
    full_name,
    email: email || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    system_access,
    commission_pct,
    role,
    branch_id: branchVal && branchVal !== "none" ? branchVal : null,
    status: (String(formData.get("status") ?? "Activo") || "Activo") as UserStatus,
  };

  let createdEmployeeCode: string | null = null;

  if (id) {
    const { data: current, error: currentError } = await supabase
      .from("profiles")
      .select("id, user_id, role, employee_code")
      .eq("id", id)
      .maybeSingle();
    if (currentError) return { error: databaseErrorMessage(currentError) };
    if (!current) return { error: "Usuario no encontrado." };
    if (
      current.role === "Super Admin" &&
      access.session.profile.role !== "Super Admin"
    ) {
      return { error: "Solo un Super Admin puede editar otro Super Admin." };
    }

    let employee_code: string | null = null;
    try {
      employee_code =
        role === "Vendedor"
          ? isFourDigitCode(current.employee_code)
            ? current.employee_code
            : await generateUniqueEmployeeCode(supabase, id)
          : null;
    } catch (error) {
      return { error: databaseErrorMessage(error) };
    }
    const values = { ...baseValues, employee_code };
    const { error } = await supabase.from("profiles").update(values).eq("id", id);
    if (error) return { error: databaseErrorMessage(error) };
    await audit(`Editó al usuario ${full_name}`, "Usuarios");
    invalidateSessionCache(current.user_id);
    revalidatePath("/usuarios");
    return {
      ok: true,
      message:
        role === "Vendedor" && !isFourDigitCode(current.employee_code)
          ? `Usuario actualizado. Código vendedor: ${employee_code}`
          : "Usuario actualizado.",
    };
  } else {
    let employee_code: string | null = null;
    try {
      employee_code =
        role === "Vendedor" ? await generateUniqueEmployeeCode(supabase) : null;
    } catch (error) {
      return { error: databaseErrorMessage(error) };
    }
    createdEmployeeCode = employee_code;
    const values = { ...baseValues, employee_code };
    const { data: profile, error } = await supabase
      .from("profiles")
      .insert(values)
      .select("id, full_name, email, role, branch_id")
      .single();
    if (error) return { error: databaseErrorMessage(error) };
    await audit(
      system_access ? `Invitó al usuario ${full_name}` : `Creó al vendedor ${full_name}`,
      "Usuarios",
    );

    if (!system_access) {
      revalidatePath("/usuarios");
      return {
        ok: true,
        message:
          role === "Vendedor"
            ? `Vendedor creado. Código secreto: ${createdEmployeeCode}`
            : "Perfil creado.",
      };
    }

    try {
      if (!profile.email) throw new Error("El perfil no tiene correo.");
      await sendUserAccessEmail({ ...profile, email: profile.email });
    } catch (error) {
      revalidatePath("/usuarios");
      return {
        ok: true,
        message:
          role === "Vendedor"
            ? `Usuario creado. Código secreto: ${createdEmployeeCode}`
            : "Usuario creado.",
        warning:
          error instanceof Error
            ? `No se pudo enviar el correo: ${error.message}`
            : "No se pudo enviar el correo de invitación.",
      };
    }
  }

  revalidatePath("/usuarios");
  return {
    ok: true,
    message:
      role === "Vendedor"
        ? `Usuario creado e invitación enviada. Código secreto: ${createdEmployeeCode}`
        : "Usuario creado e invitación enviada.",
  };
}

export async function deleteUser(id: string): Promise<FormState> {
  const access = await assertCanManageUsers();
  if ("error" in access) return { error: access.error };
  if (access.session.profile.role !== "Super Admin") {
    return { error: "Solo un Super Admin puede eliminar usuarios." };
  }
  if (id === access.session.profile.id) {
    return { error: "No puedes eliminar tu propio usuario." };
  }

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, role")
    .eq("id", id)
    .maybeSingle();
  if (targetError) return { error: targetError.message };
  if (!target) return { error: "Usuario no encontrado." };
  if (target.role === "Super Admin") {
    return { error: "No se puede eliminar un usuario Super Admin." };
  }

  if (target.user_id) {
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.deleteUser(target.user_id);
    if (authError) {
      return { error: `No se pudo eliminar la cuenta de acceso: ${authError.message}` };
    }
  }

  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit(`Eliminó al usuario ${target.full_name}`, "Usuarios", "warn");
  invalidateSessionCache(target.user_id);
  revalidatePath("/usuarios");
  return { ok: true, message: "Usuario eliminado." };
}

export async function resendUserInvite(id: string): Promise<FormState> {
  const access = await assertCanManageUsers();
  if ("error" in access) return { error: access.error };

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, branch_id, status, system_access")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!profile) return { error: "Usuario no encontrado." };
  if (profile.status !== "Activo") {
    return { error: "Activa el usuario antes de reenviar la invitación." };
  }
  if (!profile.system_access || !profile.email) {
    return { error: "Este perfil no tiene acceso por correo al sistema." };
  }

  try {
    await sendUserAccessEmail({ ...profile, email: profile.email });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `No se pudo enviar el correo: ${error.message}`
          : "No se pudo enviar el correo.",
    };
  }

  await audit(`Reenvió invitación a ${profile.full_name}`, "Usuarios");
  return { ok: true, message: "Invitación enviada." };
}

export async function regenerateSellerCode(id: string): Promise<FormState> {
  const access = await assertCanManageUsers();
  if ("error" in access) return { error: access.error };

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!profile) return { error: "Usuario no encontrado." };
  if (profile.role !== "Vendedor") {
    return { error: "Solo los vendedores tienen código de comisión." };
  }

  let employee_code: string;
  try {
    employee_code = await generateUniqueEmployeeCode(supabase, id);
  } catch (error) {
    return { error: databaseErrorMessage(error) };
  }
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ employee_code })
    .eq("id", id);
  if (updateError) return { error: databaseErrorMessage(updateError) };

  await audit(`Regeneró el código de vendedor de ${profile.full_name}`, "Usuarios");
  revalidatePath("/usuarios");
  revalidatePath("/ventas");
  return {
    ok: true,
    message: `Nuevo código secreto: ${employee_code}`,
    employeeCode: employee_code,
  };
}

export async function setPermission(
  role: string,
  module: string,
  level: number,
): Promise<FormState> {
  const access = await assertCanManageUsers();
  if ("error" in access) return { error: access.error };
  if (role === "Super Admin" && access.session.profile.role !== "Super Admin") {
    return { error: "Solo un Super Admin puede cambiar permisos de Super Admin." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("role_permissions")
    .update({ level })
    .eq("role", role)
    .eq("module", module);
  if (error) return { error: error.message };
  await audit(`Cambió permiso ${role}/${module} → ${level}`, "Usuarios");
  invalidateSessionCache();
  revalidatePath("/usuarios");
  revalidatePath("/", "layout");
  return { ok: true };
}
