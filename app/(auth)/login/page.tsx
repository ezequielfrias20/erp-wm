import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { LoginForm } from "./login-form";

export const metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <>
      <AuthHeading
        title="¡Te damos la bienvenida!"
        subtitle="Inicia sesión para continuar donde lo dejaste."
      />
      <LoginForm />
      <p className="mt-8 text-center text-[13px] text-text-2">
        ¿Recibiste una invitación?{" "}
        <Link
          href="/invite"
          className="font-semibold text-foreground underline decoration-brand decoration-2 underline-offset-4"
        >
          Activa tu cuenta
        </Link>
      </p>
    </>
  );
}
