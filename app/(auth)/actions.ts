"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; ok?: string } | null;

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Credenciales inválidas. Verifica tu correo y contraseña." };
  }

  const { data: profile } = await supabase.rpc("claim_profile");
  if (!profile) {
    await supabase.auth.signOut();
    return {
      error: "Tu cuenta no tiene acceso al ERP. Contacta a un administrador.",
    };
  }

  redirect("/dashboard");
}

export async function acceptInvite(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!email) return { error: "Ingresa el correo de tu invitación." };
  if (password.length < 8)
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== confirm) return { error: "Las contraseñas no coinciden." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  if (!data.session) {
    return {
      ok: "Cuenta creada. Si el proyecto exige confirmación por correo, revísalo; luego inicia sesión.",
    };
  }

  const { data: profile } = await supabase.rpc("claim_profile");
  if (!profile) {
    await supabase.auth.signOut();
    return {
      error:
        "No encontramos una invitación activa para este correo. Contacta a un administrador.",
    };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
