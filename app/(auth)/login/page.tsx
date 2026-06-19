import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Iniciar sesión · World Medics ERP" };

export default function LoginPage() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card-md">
      <div className="mb-5">
        <h2 className="text-[16px] font-bold tracking-tight text-foreground">
          Iniciar sesión
        </h2>
        <p className="mt-1 text-[12.5px] text-text-3">
          Accede con tu cuenta corporativa.
        </p>
      </div>
      <LoginForm />
      <p className="mt-5 text-center text-[12.5px] text-text-3">
        ¿Recibiste una invitación?{" "}
        <Link href="/invite" className="font-medium text-brand hover:underline">
          Activa tu cuenta
        </Link>
      </p>
    </div>
  );
}
