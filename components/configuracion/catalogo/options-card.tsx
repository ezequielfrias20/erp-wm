"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveOptionType, deleteOptionType, saveOptionValue, deleteOptionValue, reorderOptionTypes, reorderOptionValues } from "@/app/(app)/configuracion/catalog-actions";
import type { AdminOptionType, AdminOptionValue, CatalogAdminData } from "@/lib/catalog/admin-types";
import { ActiveField, countText, EditDialog, MasterCard, MasterRow, TextField, useMasterAction, useOrderedItems } from "./master-ui";

export function OptionsCard({ data, canEdit }: { data: CatalogAdminData; canEdit: boolean }) {
  const [editing, setEditing] = useState<AdminOptionType | null | undefined>(undefined);
  const order = useOrderedItems([...data.optionTypes].sort((a, b) => a.sortOrder - b.sortOrder), reorderOptionTypes);
  return <MasterCard title="Tallas y opciones" subtitle="Tipos de opción y valores disponibles para las variantes" action={canEdit && <Button type="button" size="sm" onClick={() => setEditing(null)}><Plus className="size-4" /> Nuevo tipo de opción</Button>}>
    <div className="space-y-4">{order.ordered.map((type, index) => <OptionBlock key={type.id} type={type} canEdit={canEdit} pending={order.pending} onEdit={() => setEditing(type)} moveUp={index > 0 ? () => order.move(index, -1) : undefined} moveDown={index < order.ordered.length - 1 ? () => order.move(index, 1) : undefined} />)}{data.optionTypes.length === 0 && <p className="text-[12px] text-text-3">Sin tipos de opción.</p>}</div>
    {editing !== undefined && <OptionTypeDialog key={editing?.id ?? "nuevo"} type={editing} onClose={() => setEditing(undefined)} />}
  </MasterCard>;
}

function OptionBlock({ type, canEdit, pending, onEdit, moveUp, moveDown }: { type: AdminOptionType; canEdit: boolean; pending: boolean; onEdit: () => void; moveUp?: () => void; moveDown?: () => void }) {
  const [editing, setEditing] = useState<AdminOptionValue | null | undefined>(undefined);
  const order = useOrderedItems([...type.values].sort((a, b) => a.sortOrder - b.sortOrder), (ids) => reorderOptionValues(type.id, ids));
  const usedValues = type.values.reduce((sum, value) => sum + value.variantCount, 0);
  const reason = type.categoryCount || usedValues ? `En uso por ${type.categoryCount} categorías y ${usedValues} variantes.` : null;
  return <section className="min-w-0 rounded-xl border border-border p-3 sm:p-4">
    <MasterRow name={type.name} count={type.categoryCount} countLabel="categorías" canEdit={canEdit} pending={pending} onEdit={onEdit} onDelete={() => deleteOptionType(type.id)} deleteReason={reason} secondary={countText(type.values.length, "valores")} sortable moveUp={moveUp} moveDown={moveDown} />
    <div className="pl-2 sm:pl-4">{order.ordered.map((value, index) => <MasterRow key={value.id} name={value.label} active={value.isActive} count={value.variantCount} countLabel="variantes" canEdit={canEdit} pending={order.pending} onEdit={() => setEditing(value)} onDelete={() => deleteOptionValue(value.id)} deleteReason={value.variantCount ? `En uso por ${value.variantCount} variantes. Desactívalo en su lugar.` : null} sortable moveUp={index > 0 ? () => order.move(index, -1) : undefined} moveDown={index < order.ordered.length - 1 ? () => order.move(index, 1) : undefined} />)}</div>
    {canEdit && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setEditing(null)}><Plus className="size-4" /> Agregar valor</Button>}
    {editing !== undefined && <OptionValueDialog key={editing?.id ?? "nuevo"} type={type} value={editing} onClose={() => setEditing(undefined)} />}
  </section>;
}

function OptionTypeDialog({ type, onClose }: { type: AdminOptionType | null; onClose: () => void }) {
  const [name, setName] = useState(type?.name ?? "");
  const mutation = useMasterAction();
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={type ? `Editar ${type.name}` : "Nuevo tipo de opción"} pending={mutation.pending} onSubmit={(event) => { event.preventDefault(); mutation.run(() => saveOptionType({ id: type?.id, name: name.trim() }), "Tipo de opción guardado", onClose); }}><TextField label="Nombre" value={name} onChange={setName} required /></EditDialog>;
}

function OptionValueDialog({ type, value, onClose }: { type: AdminOptionType; value: AdminOptionValue | null; onClose: () => void }) {
  const [label, setLabel] = useState(value?.label ?? "");
  const [slug, setSlug] = useState(value?.slug ?? "");
  const [active, setActive] = useState(value?.isActive ?? true);
  const mutation = useMasterAction();
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={value ? `Editar ${value.label}` : `Nuevo valor de ${type.name}`} pending={mutation.pending} onSubmit={(event) => { event.preventDefault(); mutation.run(() => saveOptionValue({ id: value?.id, optionTypeId: type.id, label: label.trim(), slug: slug.trim() || undefined, isActive: active }), "Valor guardado", onClose); }}>
    <TextField label="Nombre" value={label} onChange={setLabel} required /><details><summary className="cursor-pointer text-[12px] text-text-2">Opciones avanzadas</summary><div className="mt-3"><TextField label="Slug" value={slug} onChange={setSlug} placeholder="se genera del nombre" /></div></details><ActiveField value={active} onChange={setActive} />
  </EditDialog>;
}
