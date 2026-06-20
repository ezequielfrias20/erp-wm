"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import type { Role, UserStatus } from "@/lib/database.types";

export type FormState = { error?: string; ok?: boolean } | null;

export async function saveUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!full_name || !email) {
    return { error: "Nombre y correo son obligatorios." };
  }

  const branchVal = String(formData.get("branch_id") ?? "").trim();
  const values = {
    full_name,
    email,
    phone: String(formData.get("phone") ?? "").trim() || null,
    role: String(formData.get("role") ?? "Vendedor") as Role,
    branch_id: branchVal && branchVal !== "none" ? branchVal : null,
    status: (String(formData.get("status") ?? "Activo") || "Activo") as UserStatus,
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("profiles").update(values).eq("id", id);
    if (error) return { error: error.message };
    await audit(`Editó al usuario ${full_name}`, "Usuarios");
  } else {
    const { error } = await supabase.from("profiles").insert(values);
    if (error) return { error: error.message };
    await audit(`Invitó al usuario ${full_name}`, "Usuarios");
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function deleteUser(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("Eliminó un usuario", "Usuarios", "warn");
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function setPermission(
  role: string,
  module: string,
  level: number,
): Promise<FormState> {
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
