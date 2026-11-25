"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const FIELD = "h-12 rounded-xl bg-surface-2/60 px-4 shadow-none";

type FieldProps = Omit<ComponentProps<typeof Input>, "id"> & { name: string; label: string };

export function AuthField({ label, className, ...props }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} className={cn(FIELD, className)} {...props} />
    </div>
  );
}

export function AuthPasswordField({ label, className, ...props }: Omit<FieldProps, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={props.name}>{label}</Label>
      <div className="relative">
        <Input
          id={props.name}
          className={cn(FIELD, "pr-24", className)}
          {...props}
          type={visible ? "text" : "password"}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute inset-y-0 right-0 rounded-xl px-4 text-[12.5px] font-medium text-text-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </div>
  );
}

export function AuthMessage({ kind, children }: { kind: "error" | "ok"; children: ReactNode }) {
  const Icon = kind === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px]",
        kind === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
      )}
    >
      <Icon className="mt-0.5 size-4 flex-none" />
      <span>{children}</span>
    </div>
  );
}

export function AuthSubmit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="auth-submit group mt-1 h-12 w-full rounded-xl text-[15px] font-semibold"
    >
      {children}
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      )}
    </Button>
  );
}
