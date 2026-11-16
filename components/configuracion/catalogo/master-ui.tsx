"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { reportActionError } from "@/lib/action-error";
import type { MasterResult } from "@/lib/catalog/admin-types";

export function useMasterAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run(action: () => Promise<MasterResult>, success: string, onSuccess?: () => void, onFailure?: () => void) {
    start(async () => {
      try {
        const result = await action();
        if (result?.error) { onFailure?.(); toast.error(result.error); return; }
        if (!result?.ok) { onFailure?.(); toast.error("No se pudo guardar. Inténtalo de nuevo."); return; }
        toast.success(success);
        onSuccess?.();
        router.refresh();
      } catch (error) {
        onFailure?.();
        reportActionError(error, "No se pudo completar la acción.");
      }
    });
  }
  return { pending, run };
}

export function MasterCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-card-sm sm:p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-[14px] font-bold tracking-tight text-foreground">{title}</h2>{subtitle && <p className="mt-1 text-[12px] text-text-3">{subtitle}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

export function EditDialog({ open, onOpenChange, title, onSubmit, pending, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; pending: boolean; children: React.ReactNode }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Completa los datos y guarda los cambios.</DialogDescription></DialogHeader>
    <form onSubmit={onSubmit} className="space-y-4">{children}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button></DialogFooter></form>
  </DialogContent></Dialog>;
}

export function ActiveField({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium"><span>Activo</span><Switch checked={value} onCheckedChange={onChange} /></label>;
}


export function TextField({ label, value, onChange, placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return <label className="block space-y-1.5 text-[12.5px] font-medium text-foreground"><span>{label}</span><Input required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0" /></label>;
}

export function SelectField({ label, value, onChange, items }: { label: string; value: string; onChange: (value: string) => void; items: { id: string; name: string }[] }) {
  return <div className="space-y-1.5 text-[12.5px] font-medium text-foreground"><span>{label}</span><Select value={value || "__none__"} onValueChange={(next) => onChange(next === "__none__" ? "" : next)}><SelectTrigger className="w-full min-w-0"><SelectValue /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.id || "__none__"} value={item.id || "__none__"}>{item.name}</SelectItem>)}</SelectContent></Select></div>;
}

export function MasterRow({ name, active, count, countLabel, swatch, canEdit, pending = false, onEdit, onDelete, deleteReason, moveUp, moveDown, sortable = false, secondary }: { name: string; active?: boolean; count?: number; countLabel?: string; swatch?: string | null; canEdit: boolean; pending?: boolean; onEdit?: () => void; onDelete?: () => Promise<MasterResult>; deleteReason?: string | null; moveUp?: () => void; moveDown?: () => void; sortable?: boolean; secondary?: React.ReactNode }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mutation = useMasterAction();
  const busy = pending || mutation.pending;
  const reason = deleteReason || null;
  return <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border py-2.5 last:border-b-0">
    {swatch && <span className="size-5 shrink-0 rounded-full border border-border" style={{ backgroundColor: swatch }} />}
    <div className="min-w-0 flex-1 basis-[130px]"><div className="flex flex-wrap items-center gap-1.5"><span className="break-words text-[12.5px] font-semibold text-foreground">{name}</span>{active === false && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-text-3">Inactivo</span>}</div>{secondary && <div className="text-[11px] text-text-3">{secondary}</div>}</div>
    {count !== undefined && <span className="text-[11px] text-text-3">{count} {count === 1 ? singular(countLabel) : countLabel}</span>}
    {canEdit && <div className="flex shrink-0 items-center gap-0.5">
      {sortable && <button type="button" title="Subir" aria-label={`Subir ${name}`} disabled={busy || !moveUp} onClick={moveUp} className="iconbtn rounded-md p-1.5 text-text-3 disabled:opacity-40"><ArrowUp className="size-3.5" /></button>}
      {sortable && <button type="button" title="Bajar" aria-label={`Bajar ${name}`} disabled={busy || !moveDown} onClick={moveDown} className="iconbtn rounded-md p-1.5 text-text-3 disabled:opacity-40"><ArrowDown className="size-3.5" /></button>}
      {onEdit && <button type="button" title="Editar" aria-label={`Editar ${name}`} disabled={busy} onClick={onEdit} className="iconbtn rounded-md p-1.5 text-text-3 disabled:opacity-40"><Pencil className="size-3.5" /></button>}
      {onDelete && <TooltipProvider><Tooltip><TooltipTrigger asChild><span tabIndex={reason ? 0 : undefined} className="inline-flex"><button type="button" title={reason ?? "Borrar"} aria-label={`Borrar ${name}`} disabled={busy || !!reason} onClick={() => setConfirmOpen(true)} className="iconbtn rounded-md p-1.5 text-text-3 hover:text-danger disabled:opacity-40"><Trash2 className="size-3.5" /></button></span></TooltipTrigger>{reason && <TooltipContent>{reason}</TooltipContent>}</Tooltip></TooltipProvider>}
    </div>}
    {onDelete && <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent><DialogHeader><DialogTitle>¿Borrar «{name}»?</DialogTitle><DialogDescription>No se puede deshacer.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button><Button type="button" variant="destructive" disabled={mutation.pending} onClick={() => mutation.run(onDelete, "Eliminado", () => setConfirmOpen(false))}>Borrar</Button></DialogFooter></DialogContent></Dialog>}
  </div>;
}

export function useOrderedItems<T extends { id: string }>(items: T[], reorder: (ids: string[]) => Promise<MasterResult>) {
  const [orderedIds, setOrderedIds] = useState(() => items.map((item) => item.id));
  const mutation = useMasterAction();
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((item): item is T => !!item);
  for (const item of items) if (!orderedIds.includes(item.id)) ordered.push(item);
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (mutation.pending || target < 0 || target >= ordered.length) return;
    const next = ordered.map((item) => item.id);
    const previous = [...next];
    [next[index], next[target]] = [next[target], next[index]];
    setOrderedIds(next);
    mutation.run(() => reorder(next), "Orden actualizado", undefined, () => setOrderedIds(previous));
  }
  return { ordered, move, pending: mutation.pending };
}

export function useReason(count: number, what: string, deactivate = true) {
  return count > 0 ? `En uso por ${count} ${what}.${deactivate ? " Desactívalo en su lugar." : ""}` : null;
}

const SINGULAR: Record<string, string> = {
  productos: "producto", variantes: "variante", categorías: "categoría", valores: "valor", líneas: "línea",
};

/** Etiqueta del contador en singular cuando es 1 («1 variante»). */
function singular(label: string | undefined): string | undefined {
  return label ? SINGULAR[label] ?? label : label;
}
