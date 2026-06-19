"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { saveBranch, type FormState } from "@/app/(app)/sucursales/actions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VBranchStats } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const SWATCHES = ["#0EA5E9", "#6366F1", "#10B981", "#F59E0B", "#F43F5E"];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" />}
      Guardar
    </Button>
  );
}

export function BranchForm({
  open,
  onOpenChange,
  branch,
  managers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branch: VBranchStats | null;
  managers: { id: string; full_name: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    saveBranch,
    null,
  );
  const [color, setColor] = useState(branch?.color ?? SWATCHES[0]);

  useEffect(() => {
    setColor(branch?.color ?? SWATCHES[0]);
  }, [branch]);

  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {branch ? "Editar sucursal" : "Nueva sucursal"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {branch && <input type="hidden" name="id" value={branch.id} />}
          <input type="hidden" name="color" value={color} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Código" name="code" defaultValue={branch?.code} placeholder="CCS" required />
            <Field label="Ciudad" name="city" defaultValue={branch?.city} placeholder="Caracas" required />
          </div>
          <Field label="Nombre" name="name" defaultValue={branch?.name} placeholder="World Medics Sabana Grande" required />
          <Field label="Dirección" name="address" defaultValue={branch?.address ?? ""} placeholder="Av. …" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" name="phone" defaultValue={branch?.phone ?? ""} placeholder="+58 …" />
            <Field label="Meta mensual (USD)" name="monthly_goal" type="number" defaultValue={branch?.monthly_goal ?? 0} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Responsable</Label>
            <Select name="manager_id" defaultValue={branch?.manager_id ?? "none"}>
              <SelectTrigger>
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-7 rounded-full border-2 transition",
                    color === c ? "border-foreground" : "border-transparent",
                  )}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Posición mapa X (%)" name="map_x" type="number" defaultValue={branch?.map_x ?? 50} />
            <Field label="Posición mapa Y (%)" name="map_y" type="number" defaultValue={branch?.map_y ?? 40} />
          </div>

          {state?.error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
    </div>
  );
}
