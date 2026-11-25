"use client";

import { useActionState, useState } from "react";
import {
  AuthField,
  AuthMessage,
  AuthPasswordField,
  AuthSubmit,
} from "@/components/auth/auth-fields";
import { signIn, type AuthState } from "../actions";

export function LoginForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(signIn, null);
  // Controlado: React vacía los campos no controlados al terminar la acción, y tras un error
  // de contraseña no hay por qué volver a escribir el correo.
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <AuthField
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="nombre@empresa.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <AuthPasswordField
        label="Contraseña"
        name="password"
        autoComplete="current-password"
        placeholder="Tu contraseña"
        required
      />
      {state?.error && <AuthMessage kind="error">{state.error}</AuthMessage>}
      <AuthSubmit>Entrar</AuthSubmit>
    </form>
  );
}
