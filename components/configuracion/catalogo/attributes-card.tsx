"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveAttribute, deleteAttribute, saveAttributeValue, deleteAttributeValue, reorderAttributeValues } from "@/app/(app)/configuracion/catalog-actions";
import type { AdminAttribute, AdminAttributeValue, CatalogAdminData } from "@/lib/catalog/admin-types";
import { ActiveField, EditDialog, MasterCard, MasterRow, TextField, useMasterAction, useOrderedItems } from "./master-ui";
import { Switch } from "@/components/ui/switch";

export function AttributesCard({ data, canEdit }: { data: CatalogAdminData; canEdit: boolean }) {
  const [editing, setEditing] = useState<AdminAttribute | null | undefined>(undefined);
  return <MasterCard title="Características" subtitle="Datos que describen los productos" action={canEdit && <Button type="button" size="sm" onClick={() => setEditing(null)}><Plus className="size-4" /> Nueva característica</Button>}>
    <div className="space-y-4">{data.attributes.map((attribute) => <AttributeBlock key={attribute.id} attribute={attribute} canEdit={canEdit} onEdit={() => setEditing(attribute)} />)}{data.attributes.length === 0 && <p className="text-[12px] text-text-3">Sin características.</p>}</div>
    {editing !== undefined && <AttributeDialog key={editing?.id ?? "nuevo"} attribute={editing} onClose={() => setEditing(undefined)} />}
  </MasterCard>;
}

function AttributeBlock({ attribute, canEdit, onEdit }: { attribute: AdminAttribute; canEdit: boolean; onEdit: () => void }) {
  const [editing, setEditing] = useState<AdminAttributeValue | null | undefined>(undefined);
  const order = useOrderedItems([...attribute.values].sort((a, b) => a.sortOrder - b.sortOrder), (ids) => reorderAttributeValues(attribute.id, ids));
  const usedValues = attribute.values.reduce((sum, value) => sum + value.productCount, 0);
  const reason = attribute.categoryCount || usedValues ? `En uso por ${attribute.categoryCount} categorías y ${usedValues} productos.` : null;
  return <section className="min-w-0 rounded-xl border border-border p-3 sm:p-4">
    <MasterRow name={attribute.name} count={attribute.categoryCount} countLabel="categorías" canEdit={canEdit} onEdit={onEdit} onDelete={() => deleteAttribute(attribute.id)} deleteReason={reason} secondary={attribute.isMulti ? "Múltiple" : "Una sola"} />
    <div className="pl-2 sm:pl-4">{order.ordered.map((value, index) => <MasterRow key={value.id} name={value.name} active={value.isActive} count={value.productCount} countLabel="productos" canEdit={canEdit} pending={order.pending} onEdit={() => setEditing(value)} onDelete={() => deleteAttributeValue(value.id)} deleteReason={value.productCount ? `En uso por ${value.productCount} productos. Desactívalo en su lugar.` : null} sortable moveUp={index > 0 ? () => order.move(index, -1) : undefined} moveDown={index < order.ordered.length - 1 ? () => order.move(index, 1) : undefined} />)}</div>
    {canEdit && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setEditing(null)}><Plus className="size-4" /> Agregar valor</Button>}
    {editing !== undefined && <AttributeValueDialog key={editing?.id ?? "nuevo"} attribute={attribute} value={editing} onClose={() => setEditing(undefined)} />}
  </section>;
}

function AttributeDialog({ attribute, onClose }: { attribute: AdminAttribute | null; onClose: () => void }) {
  const [name, setName] = useState(attribute?.name ?? "");
  const [multi, setMulti] = useState(attribute?.isMulti ?? false);
  const mutation = useMasterAction();
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={attribute ? `Editar ${attribute.name}` : "Nueva característica"} pending={mutation.pending} onSubmit={(event) => { event.preventDefault(); mutation.run(() => saveAttribute({ id: attribute?.id, name: name.trim(), isMulti: multi }), "Característica guardada", onClose); }}><TextField label="Nombre" value={name} onChange={setName} required /><label className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium">Permite varios valores<Switch checked={multi} onCheckedChange={setMulti} /></label></EditDialog>;
}

function AttributeValueDialog({ attribute, value, onClose }: { attribute: AdminAttribute; value: AdminAttributeValue | null; onClose: () => void }) {
  const [name, setName] = useState(value?.name ?? "");
  const [slug, setSlug] = useState(value?.slug ?? "");
  const [active, setActive] = useState(value?.isActive ?? true);
  const mutation = useMasterAction();
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={value ? `Editar ${value.name}` : `Nuevo valor de ${attribute.name}`} pending={mutation.pending} onSubmit={(event) => { event.preventDefault(); mutation.run(() => saveAttributeValue({ id: value?.id, attributeId: attribute.id, name: name.trim(), slug: slug.trim() || undefined, isActive: active }), "Valor guardado", onClose); }}><TextField label="Nombre" value={name} onChange={setName} required /><details><summary className="cursor-pointer text-[12px] text-text-2">Opciones avanzadas</summary><div className="mt-3"><TextField label="Slug" value={slug} onChange={setSlug} placeholder="se genera del nombre" /></div></details><ActiveField value={active} onChange={setActive} /></EditDialog>;
}
