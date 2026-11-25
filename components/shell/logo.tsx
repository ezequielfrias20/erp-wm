import { Building2 } from "lucide-react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Marca genérica cuando el negocio no ha subido logo: sus iniciales sobre el color de marca
 *  (o un icono neutro si tampoco hay nombre). */
export function Logo({
  size = 36,
  name,
  className,
}: {
  size?: number;
  name?: string | null;
  className?: string;
}) {
  const label = name?.trim();
  return (
    <div
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center rounded-[10px] font-bold text-primary-foreground",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: "linear-gradient(140deg,var(--brand),var(--brand-2))",
        boxShadow: "inset 0 0 0 1px rgba(128,128,128,.3), 0 6px 16px -6px var(--brand)",
      }}
    >
      {label ? initials(label) : <Building2 size={Math.round(size * 0.53)} />}
    </div>
  );
}
