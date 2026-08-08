import Link from "next/link";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Activar cuenta · World Medics ERP" };

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const email = (await searchParams).email ?? "";

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card-md">
      <div className="mb-5">
        <h2 className="text-[16px] font-bold tracking-tight text-foreground">
          Activar cuenta
        </h2>
        <p className="mt-1 text-[12.5px] text-text-3">
          Define tu contraseña con el correo de tu invitación.
        </p>
      </div>
      <InviteForm initialEmail={email} />
      <p className="mt-5 text-center text-[12.5px] text-text-3">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
