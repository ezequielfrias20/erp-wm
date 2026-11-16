"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveBrand, deleteBrand, saveLine, deleteLine, reorderLines } from "@/app/(app)/configuracion/catalog-actions";
import type { AdminBrand, AdminLine, CatalogAdminData } from "@/lib/catalog/admin-types";
import { ActiveField, EditDialog, MasterCard, MasterRow, TextField, useMasterAction, useOrderedItems } from "./master-ui";

export function BrandsCard({ data, canEdit }: { data: CatalogAdminData; canEdit: boolean }) {
  const [editing, setEditing] = useState<AdminBrand | null | undefined>(undefined);
  return <MasterCard title="Marcas y líneas" subtitle={`${data.brands.length} marcas`} action={canEdit && <Button type="button" size="sm" onClick={() => setEditing(null)}><Plus className="size-4" /> Nueva marca</Button>}>
    <div className="space-y-4">{data.brands.map((brand) => <BrandBlock key={brand.id} brand={brand} canEdit={canEdit} onEdit={() => setEditing(brand)} />)}{data.brands.length === 0 && <p className="text-[12px] text-text-3">Sin marcas.</p>}</div>
    {editing !== undefined && <BrandDialog key={editing?.id ?? "nueva"} brand={editing} onClose={() => setEditing(undefined)} />}
  </MasterCard>;
}

function BrandBlock({ brand, canEdit, onEdit }: { brand: AdminBrand; canEdit: boolean; onEdit: () => void }) {
  const [editing, setEditing] = useState<AdminLine | null | undefined>(undefined);
  const order = useOrderedItems([...brand.lines].sort((a, b) => a.sortOrder - b.sortOrder), (ids) => reorderLines(brand.id, ids));
  const reason = brand.productCount || brand.lines.length ? `En uso por ${brand.productCount} productos y ${brand.lines.length} líneas. Desactívala en su lugar.` : null;
  return <section className="min-w-0 rounded-xl border border-border p-3 sm:p-4">
    <MasterRow name={brand.name} active={brand.isActive} count={brand.productCount} countLabel="productos" canEdit={canEdit} onEdit={onEdit} onDelete={() => deleteBrand(brand.id)} deleteReason={reason} secondary={brand.description} />
    <div className="pl-2 sm:pl-4">{order.ordered.map((line, index) => <MasterRow key={line.id} name={line.name} active={line.isActive} count={line.productCount} countLabel="productos" canEdit={canEdit} pending={order.pending} onEdit={() => setEditing(line)} onDelete={() => deleteLine(line.id)} deleteReason={line.productCount ? `En uso por ${line.productCount} productos. Desactívala en su lugar.` : null} sortable moveUp={index > 0 ? () => order.move(index, -1) : undefined} moveDown={index < order.ordered.length - 1 ? () => order.move(index, 1) : undefined} />)}</div>
    {canEdit && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setEditing(null)}><Plus className="size-4" /> Agregar línea</Button>}
    {editing !== undefined && <LineDialog key={editing?.id ?? "nueva"} brand={brand} line={editing} onClose={() => setEditing(undefined)} />}
  </section>;
}

function BrandDialog({ brand, onClose }: { brand: AdminBrand | null; onClose: () => void }) {
  const [name, setName] = useState(brand?.name ?? "");
  const [description, setDescription] = useState(brand?.description ?? "");
  const [slug, setSlug] = useState(brand?.slug ?? "");
  const [active, setActive] = useState(brand?.isActive ?? true);
  const mutation = useMasterAction();
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={brand ? `Editar ${brand.name}` : "Nueva marca"} pending={mutation.pending} onSubmit={(event) => { event.preventDefault(); mutation.run(() => saveBrand({ id: brand?.id, name: name.trim(), description: description.trim() || null, slug: slug.trim() || undefined, isActive: active }), "Marca guardada", onClose); }}><TextField label="Nombre" value={name} onChange={setName} required /><label className="block space-y-1.5 text-[12.5px] font-medium"><span>Descripción corta</span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} /></label><details><summary className="cursor-pointer text-[12px] text-text-2">Opciones avanzadas</summary><div className="mt-3"><TextField label="Slug" value={slug} onChange={setSlug} placeholder="se genera del nombre" /></div></details><ActiveField value={active} onChange={setActive} /></EditDialog>;
}

function LineDialog({ brand, line, onClose }: { brand: AdminBrand; line: AdminLine | null; onClose: () => void }) {
  const [name, setName] = useState(line?.name ?? "");
  const [slug, setSlug] = useState(line?.slug ?? "");
  const [active, setActive] = useState(line?.isActive ?? true);
  const mutation = useMasterAction();
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={line ? `Editar ${line.name}` : `Nueva línea de ${brand.name}`} pending={mutation.pending} onSubmit={(event) => { event.preventDefault(); mutation.run(() => saveLine({ id: line?.id, brandId: brand.id, name: name.trim(), slug: slug.trim() || undefined, isActive: active }), "Línea guardada", onClose); }}><TextField label="Nombre" value={name} onChange={setName} required /><details><summary className="cursor-pointer text-[12px] text-text-2">Opciones avanzadas</summary><div className="mt-3"><TextField label="Slug" value={slug} onChange={setSlug} placeholder="se genera del nombre" /></div></details><ActiveField value={active} onChange={setActive} /></EditDialog>;
}
