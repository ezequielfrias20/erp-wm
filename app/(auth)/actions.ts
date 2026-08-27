"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateSessionCache } from "@/lib/queries/session";

export type AuthState = { error?: string; ok?: string } | null;

type AdminClient = ReturnType<typeof createAdminClient>;

async function findAuthUserByEmail(admin: AdminClient, email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;

    const user = data.users.find((u) => u.email?.toLowerCase() === target);
    if (user) return user;
    if (!data.nextPage) break;
  }
  return null;
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return {
        error:
          "La cuenta existe, pero el correo no quedó confirmado. Vuelve a activar el usuario desde el enlace de invitación.",
      };
    }
    return { error: "Credenciales inválidas. Verifica tu correo y contraseña." };
  }

  // `claim_profile` enlaza el perfil en el primer ingreso, así que aquí NO se usa el
  // caché; y se tira la entrada previa para que la sesión arranque con datos frescos.
  const { data: claimedProfile } = await supabase.rpc("claim_profile");
  if (!claimedProfile) {
    await supabase.auth.signOut();
    return {
      error: "Tu cuenta no tiene acceso al ERP. Contacta a un administrador.",
    };
  }
  invalidateSessionCache(claimedProfile.user_id);

  redirect("/dashboard");
}

export async function acceptInvite(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!email) return { error: "Ingresa el correo de tu invitación." };
  if (password.length < 8)
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== confirm) return { error: "Las contraseñas no coinciden." };

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, user_id, full_name, email, status, system_access")
    .eq("email", email)
    .maybeSingle();
  if (profileError) return { error: profileError.message };
  if (!profile || profile.status !== "Activo" || !profile.system_access || !profile.email) {
    return {
      error:
        "No encontramos una invitación activa para este correo. Contacta a un administrador.",
    };
  }

  let authUser = null;
  try {
    if (profile.user_id) {
      const { data, error } = await admin.auth.admin.getUserById(profile.user_id);
      if (!error) authUser = data.user;
    }
    authUser ??= await findAuthUserByEmail(admin, email);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `No se pudo validar la cuenta de acceso: ${error.message}`
          : "No se pudo validar la cuenta de acceso.",
    };
  }

  const userAttrs = {
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: profile.full_name },
  };

  const userResult = authUser
    ? await admin.auth.admin.updateUserById(authUser.id, userAttrs)
    : await admin.auth.admin.createUser(userAttrs);
  if (userResult.error || !userResult.data.user) {
    return {
      error:
        userResult.error?.message ??
        "No se pudo crear la cuenta de acceso. Contacta a un administrador.",
    };
  }

  const userId = userResult.data.user.id;
  if (profile.user_id !== userId) {
    const { error } = await admin
      .from("profiles")
      .update({ user_id: userId })
      .eq("id", profile.id);
    if (error) return { error: error.message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  const { data: claimedProfile } = await supabase.rpc("claim_profile");
  if (!claimedProfile) {
    await supabase.auth.signOut();
    return {
      error:
        "No encontramos una invitación activa para este correo. Contacta a un administrador.",
    };
  }
  invalidateSessionCache(claimedProfile.user_id);

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
