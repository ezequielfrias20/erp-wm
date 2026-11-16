"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductSpec } from "@/lib/database.types";

type SpecRow = ProductSpec & { id: number };

export function SpecsEditor({ specs, canEdit }: { specs: ProductSpec[]; canEdit: boolean }) {
  const [rows, setRows] = useState<SpecRow[]>(() => specs.map((spec, id) => ({ ...spec, id })));
  const nextId = useRef(specs.length);

  function update(id: number, key: keyof ProductSpec, value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [key]: value } : row));
  }

  function move(index: number, offset: number) {
    setRows((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="border-t border-border pt-3">
      <input type="hidden" name="specs" value={JSON.stringify(rows.map(({ label, value }) => ({ label, value })))} />
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-[12.5px] font-semibold text-foreground">Ficha técnica</div>
          <p className="text-[11.5px] text-text-3">Datos adicionales del producto.</p>
        </div>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => [...current, { id: nextId.current++, label: "", value: "" }])}>
            <Plus className="size-4" /> Agregar
          </Button>
        )}
      </div>
      {rows.length === 0 && <p className="text-[12px] text-text-3">Sin datos en la ficha técnica.</p>}
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <Input aria-label={`Etiqueta ${index + 1}`} placeholder="Etiqueta" value={row.label} onChange={(event) => update(row.id, "label", event.target.value)} disabled={!canEdit} className="min-w-0 flex-1" />
            <Input aria-label={`Valor ${index + 1}`} placeholder="Valor" value={row.value} onChange={(event) => update(row.id, "value", event.target.value)} disabled={!canEdit} className="min-w-0 flex-1" />
            {canEdit && (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Subir fila ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Bajar fila ${index + 1}`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar fila ${index + 1}`} className="text-danger" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 className="size-3.5" /></Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
