"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveAttribute, deleteAttribute, saveAttributeValue, deleteAttributeValue, reorderAttributes, reorderAttributeValues } from "@/app/(app)/configuracion/catalog-actions";
import type { AdminAttribute, AdminAttributeValue, CatalogAdminData } from "@/lib/catalog/admin-types";
import { ActiveField, countText, EditDialog, MasterCard, MasterRow, TextField, useMasterAction, useOrderedItems } from "./master-ui";
import { Switch } from "@/components/ui/switch";

export function AttributesCard({ data, canEdit }: { data: CatalogAdminData; canEdit: boolean }) {
  const [editing, setEditing] = useState<AdminAttribute | null | undefined>(undefined);
  const order = useOrderedItems([...data.attributes].sort((a, b) => a.sortOrder - b.sortOrder), reorderAttributes);
  return <MasterCard title="Características" subtitle="Datos que describen los productos" action={canEdit && <Button type="button" size="sm" onClick={() => setEditing(null)}><Plus className="size-4" /> Nueva característica</Button>}>
    <div className="space-y-4">{order.ordered.map((attribute, index) => <AttributeBlock key={attribute.id} attribute={attribute} canEdit={canEdit} pending={order.pending} onEdit={() => setEditing(attribute)} moveUp={index > 0 ? () => order.move(index, -1) : undefined} moveDown={index < order.ordered.length - 1 ? () => order.move(index, 1) : undefined} />)}{data.attributes.length === 0 && <p className="text-[12px] text-text-3">Sin características.</p>}</div>
    {editing !== undefined && <AttributeDialog key={editing?.id ?? "nuevo"} attribute={editing} onClose={() => setEditing(undefined)} />}
  </MasterCard>;
}

function AttributeBlock({ attribute, canEdit, pending, onEdit, moveUp, moveDown }: { attribute: AdminAttribute; canEdit: boolean; pending: boolean; onEdit: () => void; moveUp?: () => void; moveDown?: () => void }) {
  const [editing, setEditing] = useState<AdminAttributeValue | null | undefined>(undefined);
  const order = useOrderedItems([...attribute.values].sort((a, b) => a.sortOrder - b.sortOrder), (ids) => reorderAttributeValues(attribute.id, ids));
  const uses = [attribute.categoryCount > 0 ? countText(attribute.categoryCount, "categorías") : null, attribute.productCount > 0 ? countText(attribute.productCount, "productos") : null].filter(Boolean);
  const reason = uses.length ? `En uso por ${uses.join(" y ")}.` : null;
  return <section className="min-w-0 rounded-xl border border-border p-3 sm:p-4">
    <MasterRow name={attribute.name} count={attribute.categoryCount} countLabel="categorías" canEdit={canEdit} pending={pending} onEdit={onEdit} onDelete={() => deleteAttribute(attribute.id)} deleteReason={reason} secondary={attribute.isMulti ? "Múltiple" : "Una sola"} sortable moveUp={moveUp} moveDown={moveDown} />
    <div className="pl-2 sm:pl-4">{order.ordered.map((value, index) => <MasterRow key={value.id} name={value.name} active={value.isActive} count={value.productCount} countLabel="productos" canEdit={canEdit} pending={order.pending} onEdit={() => setEditing(value)} onDelete={() => deleteAttributeValue(value.id)} deleteReason={value.productCount ? `En uso por ${value.productCount} productos. Desactívalo en su lugar.` : null} sortable moveUp={index > 0 ? () => order.move(index, -1) : undefined} moveDown={index < order.ordered.length - 1 ? () => order.move(index, 1) : undefined} />)}</div>
    {canEdit && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setEditing(null)}><Plus className="size-4" /> Agregar valor</Button>}
    {editing !== undefined && <AttributeValueDialog key={editing?.id ?? "nuevo"} attribute={attribute} value={editing} onClose={() => setEditing(undefined)} />}
  </section>;
}

function AttributeDialog({ attribute, onClose }: { attribute: AdminAttribute | null; onClose: () => void }) {
  const [name, setName] = useState(attribute?.name ?? "");
  const [multi, setMulti] = useState(attribute?.isMulti ?? false);
  const mutation = useMasterAction();
  const blocked = !!attribute && attribute.isMulti && !multi && attribute.multiValueProductCount > 0;
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={attribute ? `Editar ${attribute.name}` : "Nueva característica"} pending={mutation.pending} saveDisabled={blocked} onSubmit={(event) => { event.preventDefault(); if (blocked) return; mutation.run(() => saveAttribute({ id: attribute?.id, name: name.trim(), isMulti: multi }), "Característica guardada", onClose); }}><TextField label="Nombre" value={name} onChange={setName} required /><label className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium">Permite varios valores<Switch checked={multi} onCheckedChange={setMulti} /></label>{blocked && <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-[12px] text-danger">{countText(attribute.multiValueProductCount, "productos")} {attribute.multiValueProductCount === 1 ? "tiene" : "tienen"} varios valores de esta característica. {attribute.multiValueProductCount === 1 ? "Déjale" : "Déjales"} uno antes de cambiarla a un solo valor.</p>}</EditDialog>;
}

function AttributeValueDialog({ attribute, value, onClose }: { attribute: AdminAttribute; value: AdminAttributeValue | null; onClose: () => void }) {
  const [name, setName] = useState(value?.name ?? "");
  const [slug, setSlug] = useState(value?.slug ?? "");
  const [active, setActive] = useState(value?.isActive ?? true);
  const mutation = useMasterAction();
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={value ? `Editar ${value.name}` : `Nuevo valor de ${attribute.name}`} pending={mutation.pending} onSubmit={(event) => { event.preventDefault(); mutation.run(() => saveAttributeValue({ id: value?.id, attributeId: attribute.id, name: name.trim(), slug: slug.trim() || undefined, isActive: active }), "Valor guardado", onClose); }}><TextField label="Nombre" value={name} onChange={setName} required /><details><summary className="cursor-pointer text-[12px] text-text-2">Opciones avanzadas</summary><div className="mt-3"><TextField label="Slug" value={slug} onChange={setSlug} placeholder="se genera del nombre" /></div></details><ActiveField value={active} onChange={setActive} /></EditDialog>;
}
