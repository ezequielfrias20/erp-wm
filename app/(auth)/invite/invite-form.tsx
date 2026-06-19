"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { acceptInvite, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-10 w-full font-semibold" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      Activar cuenta
    </Button>
  );
}

export function InviteForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(
    acceptInvite,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo de la invitación</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nombre@worldmedics.ve"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirmar contraseña</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Repite la contraseña"
          required
        />
      </div>

      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          <AlertCircle className="mt-0.5 size-4 flex-none" />
          <span>{state.error}</span>
        </div>
      )}
      {state?.ok && (
        <div className="flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] text-success">
          <CheckCircle2 className="mt-0.5 size-4 flex-none" />
          <span>{state.ok}</span>
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
