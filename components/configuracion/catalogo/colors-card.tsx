"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { colorDeleteError } from "@/lib/catalog/masters";
import { Input } from "@/components/ui/input";
import { saveColor, deleteColor, reorderColors } from "@/app/(app)/configuracion/catalog-actions";
import type { AdminColor, CatalogAdminData } from "@/lib/catalog/admin-types";
import { ActiveField, EditDialog, MasterCard, MasterRow, SelectField, TextField, useMasterAction, useOrderedItems } from "./master-ui";

export function ColorsCard({ data, canEdit }: { data: CatalogAdminData; canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminColor | null | undefined>(undefined);
  const filtered = data.colors.filter((color) => color.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
  return <MasterCard title="Colores" subtitle={`${data.colors.length} colores en ${data.families.length} familias`} action={canEdit && <Button type="button" size="sm" onClick={() => setEditing(null)}><Plus className="size-4" /> Nuevo color</Button>}>
    <label className="relative mb-3 block"><Search className="absolute left-3 top-2.5 size-4 text-text-3" /><span className="sr-only">Buscar color</span><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre" className="pl-9" /></label>
    {data.families.map((family) => <ColorFamily key={family.id} family={family} colors={data.colors.filter((color) => color.familyId === family.id)} search={search} canEdit={canEdit} onEdit={setEditing} />)}
    {filtered.some((color) => !data.families.some((family) => family.id === color.familyId)) && <section><h3 className="rounded-lg bg-surface-2 px-3 py-2 text-[12px] font-bold">Sin familia</h3>{filtered.filter((color) => !data.families.some((family) => family.id === color.familyId)).map((color) => <ColorRow key={color.id} color={color} canEdit={canEdit} onEdit={() => setEditing(color)} />)}</section>}
    {filtered.length === 0 && <p className="py-6 text-center text-[12px] text-text-3">No hay colores que coincidan.</p>}
    {editing !== undefined && <ColorDialog key={editing?.id ?? "nuevo"} color={editing} families={data.families} onClose={() => setEditing(undefined)} />}
  </MasterCard>;
}

function ColorFamily({ family, colors, search, canEdit, onEdit }: { family: CatalogAdminData["families"][number]; colors: AdminColor[]; search: string; canEdit: boolean; onEdit: (color: AdminColor) => void }) {
  const order = useOrderedItems([...colors].sort((a, b) => a.sortOrder - b.sortOrder), (ids) => reorderColors(family.id, ids));
  const visible = order.ordered.filter((color) => color.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
  if (!visible.length) return null;
  return <section className="mb-4 last:mb-0"><h3 className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] font-bold"><span className="size-3 rounded-full border border-border" style={{ backgroundColor: family.hex ?? undefined }} />{family.name} <span className="font-normal text-text-3">({visible.length})</span></h3><div className="px-1 sm:px-3">{visible.map((color, index) => <ColorRow key={color.id} color={color} canEdit={canEdit} pending={order.pending} onEdit={() => onEdit(color)} sortable={!search} moveUp={!search && index > 0 ? () => order.move(index, -1) : undefined} moveDown={!search && index < visible.length - 1 ? () => order.move(index, 1) : undefined} />)}</div></section>;
}

function ColorRow({ color, canEdit, onEdit, pending, sortable, moveUp, moveDown }: { color: AdminColor; canEdit: boolean; onEdit: () => void; pending?: boolean; sortable?: boolean; moveUp?: () => void; moveDown?: () => void }) {
  const reason = colorDeleteError(color.variantCount, color.photoCount);
  return <MasterRow name={color.name} active={color.isActive} count={color.variantCount} countLabel="variantes" swatch={color.hex} canEdit={canEdit} pending={pending} onEdit={onEdit} onDelete={() => deleteColor(color.id)} deleteReason={reason} sortable={sortable} moveUp={moveUp} moveDown={moveDown} />;
}

function ColorDialog({ color, families, onClose }: { color: AdminColor | null; families: CatalogAdminData["families"]; onClose: () => void }) {
  const [name, setName] = useState(color?.name ?? "");
  const [hex, setHex] = useState(color?.hex ?? "#000000");
  const [familyId, setFamilyId] = useState(color?.familyId ?? "");
  const [slug, setSlug] = useState(color?.slug ?? "");
  const [active, setActive] = useState(color?.isActive ?? true);
  const mutation = useMasterAction();
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={color ? `Editar ${color.name}` : "Nuevo color"} pending={mutation.pending} saveDisabled={!familyId} onSubmit={(event) => { event.preventDefault(); if (!familyId) return; mutation.run(() => saveColor({ id: color?.id, name: name.trim(), hex: hex.trim(), familyId, slug: slug.trim() || undefined, isActive: active }), "Color guardado", onClose); }}>
    <TextField label="Nombre" value={name} onChange={setName} required />
    <div className="grid grid-cols-[70px_1fr] items-end gap-3"><label className="space-y-1.5 text-[12.5px] font-medium"><span>Color</span><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000"} onChange={(event) => setHex(event.target.value)} className="h-9 w-full cursor-pointer rounded-md border border-input" /></label><TextField label="Hexadecimal" value={hex} onChange={setHex} placeholder="#000000" required /></div>
    <SelectField label="Familia" value={familyId} onChange={setFamilyId} items={families} placeholder="Elige una familia" />
    <details><summary className="cursor-pointer text-[12px] text-text-2">Opciones avanzadas</summary><div className="mt-3"><TextField label="Slug" value={slug} onChange={setSlug} placeholder="se genera del nombre" /></div></details>
    <ActiveField value={active} onChange={setActive} />
  </EditDialog>;
}
