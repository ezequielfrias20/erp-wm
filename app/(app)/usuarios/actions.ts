"use server";

import { revalidatePath } from "next/cache";
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
  | { error?: string; ok?: boolean; message?: string; warning?: string }
  | null;

type UserAccessEmailProfile = Pick<
  Profile,
  "id" | "full_name" | "email" | "role" | "branch_id"
>;

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

export async function saveUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await assertCanManageUsers();
  if ("error" in access) return { error: access.error };

  const id = String(formData.get("id") ?? "").trim();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!full_name || !email) {
    return { error: "Nombre y correo son obligatorios." };
  }

  const branchVal = String(formData.get("branch_id") ?? "").trim();
  const role = String(formData.get("role") ?? "Vendedor") as Role;
  if (role === "Super Admin" && access.session.profile.role !== "Super Admin") {
    return { error: "Solo un Super Admin puede crear o asignar otro Super Admin." };
  }

  const values = {
    full_name,
    email,
    phone: String(formData.get("phone") ?? "").trim() || null,
    role,
    branch_id: branchVal && branchVal !== "none" ? branchVal : null,
    status: (String(formData.get("status") ?? "Activo") || "Activo") as UserStatus,
  };

  const supabase = await createClient();
  if (id) {
    const { data: current, error: currentError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", id)
      .maybeSingle();
    if (currentError) return { error: currentError.message };
    if (!current) return { error: "Usuario no encontrado." };
    if (
      current.role === "Super Admin" &&
      access.session.profile.role !== "Super Admin"
    ) {
      return { error: "Solo un Super Admin puede editar otro Super Admin." };
    }

    const { error } = await supabase.from("profiles").update(values).eq("id", id);
    if (error) return { error: error.message };
    await audit(`Editó al usuario ${full_name}`, "Usuarios");
    revalidatePath("/usuarios");
    return { ok: true, message: "Usuario actualizado." };
  } else {
    const { data: profile, error } = await supabase
      .from("profiles")
      .insert(values)
      .select("id, full_name, email, role, branch_id")
      .single();
    if (error) return { error: error.message };
    await audit(`Invitó al usuario ${full_name}`, "Usuarios");

    try {
      await sendUserAccessEmail(profile);
    } catch (error) {
      revalidatePath("/usuarios");
      return {
        ok: true,
        message: "Usuario creado.",
        warning:
          error instanceof Error
            ? `No se pudo enviar el correo: ${error.message}`
            : "No se pudo enviar el correo de invitación.",
      };
    }
  }

  revalidatePath("/usuarios");
  return { ok: true, message: "Usuario creado e invitación enviada." };
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
  revalidatePath("/usuarios");
  return { ok: true, message: "Usuario eliminado." };
}

export async function resendUserInvite(id: string): Promise<FormState> {
  const access = await assertCanManageUsers();
  if ("error" in access) return { error: access.error };

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, branch_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!profile) return { error: "Usuario no encontrado." };
  if (profile.status !== "Activo") {
    return { error: "Activa el usuario antes de reenviar la invitación." };
  }

  try {
    await sendUserAccessEmail(profile);
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
  revalidatePath("/usuarios");
  revalidatePath("/", "layout");
  return { ok: true };
}
