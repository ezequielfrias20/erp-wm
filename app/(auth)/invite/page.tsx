import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Activar cuenta" };

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const email = (await searchParams).email ?? "";

  return (
    <>
      <AuthHeading
        title="Activa tu cuenta"
        subtitle="Define tu contraseña con el correo de tu invitación."
      />
      <InviteForm initialEmail={email} />
      <p className="mt-8 text-center text-[13px] text-text-2">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-semibold text-foreground underline decoration-brand decoration-2 underline-offset-4"
        >
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
