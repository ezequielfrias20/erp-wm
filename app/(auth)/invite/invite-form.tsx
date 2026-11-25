"use client";

import { useActionState, useState } from "react";
import {
  AuthField,
  AuthMessage,
  AuthPasswordField,
  AuthSubmit,
} from "@/components/auth/auth-fields";
import { acceptInvite, type AuthState } from "../actions";

export function InviteForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(
    acceptInvite,
    null,
  );
  // Controlado: se conserva tras un error (React vacía los campos no controlados).
  const [email, setEmail] = useState(initialEmail);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <AuthField
        label="Correo de la invitación"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="nombre@empresa.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <AuthPasswordField
        label="Nueva contraseña"
        name="password"
        autoComplete="new-password"
        placeholder="Mínimo 8 caracteres"
        required
      />
      <AuthPasswordField
        label="Confirmar contraseña"
        name="confirm"
        autoComplete="new-password"
        placeholder="Repite la contraseña"
        required
      />
      {state?.error && <AuthMessage kind="error">{state.error}</AuthMessage>}
      {state?.ok && <AuthMessage kind="ok">{state.ok}</AuthMessage>}
      <AuthSubmit>Activar cuenta</AuthSubmit>
    </form>
  );
}
