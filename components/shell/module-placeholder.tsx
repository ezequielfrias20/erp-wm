import Link from "next/link";
import { Hammer } from "lucide-react";

/** Mirrors the handoff "Módulo" placeholder screen for routes not yet built out. */
export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-[1560px] flex-col items-center justify-center px-[30px] py-24 text-center fadeup">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <Hammer className="size-7" />
      </span>
      <h2 className="mt-5 text-[22px] font-bold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-[13.5px] text-text-2">
        Este módulo forma parte del sistema World Medics y se construirá en la
        siguiente iteración.
      </p>
      <Link
        href="/dashboard"
        className="hoverlift mt-6 flex h-[38px] items-center rounded-[10px] bg-brand px-4 text-[13px] font-semibold text-white"
      >
        Volver al dashboard
      </Link>
    </div>
  );
}
