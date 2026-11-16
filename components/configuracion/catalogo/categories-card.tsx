"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { saveCategory, deleteCategory, reorderCategories } from "@/app/(app)/configuracion/catalog-actions";
import type { AdminCategory, AdminDepartment, CatalogAdminData } from "@/lib/catalog/admin-types";
import { ActiveField, EditDialog, MasterCard, MasterRow, SelectField, TextField, useMasterAction, useOrderedItems } from "./master-ui";

export function CategoriesCard({ data, canEdit }: { data: CatalogAdminData; canEdit: boolean }) {
  const [department, setDepartment] = useState<AdminDepartment | null | undefined>(undefined);
  const order = useOrderedItems([...data.departments].sort((a, b) => a.sortOrder - b.sortOrder), (ids) => reorderCategories(null, ids));
  return <MasterCard title="Categorías" subtitle="Departamentos y categorías del catálogo" action={canEdit && <Button type="button" size="sm" onClick={() => setDepartment(null)}><Plus className="size-4" /> Nuevo departamento</Button>}>
    <div className="space-y-4">{order.ordered.map((item, index) => <DepartmentBlock key={item.id} department={item} data={data} canEdit={canEdit} pending={order.pending} onEdit={() => setDepartment(item)} moveUp={index > 0 ? () => order.move(index, -1) : undefined} moveDown={index < order.ordered.length - 1 ? () => order.move(index, 1) : undefined} />)}{data.departments.length === 0 && <p className="text-[12px] text-text-3">Sin departamentos.</p>}</div>
    {department !== undefined && <DepartmentDialog key={department?.id ?? "nuevo"} department={department} onClose={() => setDepartment(undefined)} />}
  </MasterCard>;
}

function DepartmentBlock({ department, data, canEdit, pending, onEdit, moveUp, moveDown }: { department: AdminDepartment; data: CatalogAdminData; canEdit: boolean; pending: boolean; onEdit: () => void; moveUp?: () => void; moveDown?: () => void }) {
  const [category, setCategory] = useState<AdminCategory | null | undefined>(undefined);
  const order = useOrderedItems([...department.categories].sort((a, b) => a.sortOrder - b.sortOrder), (ids) => reorderCategories(department.id, ids));
  const reason = department.productCount || department.categories.length ? `En uso por ${department.productCount} productos y ${department.categories.length} categorías. Desactívalo en su lugar.` : null;
  return <section className="min-w-0 rounded-xl border border-border p-3 sm:p-4">
    <MasterRow name={department.name} active={department.isActive} count={department.productCount} countLabel="productos" canEdit={canEdit} pending={pending} onEdit={onEdit} onDelete={() => deleteCategory(department.id)} deleteReason={reason} sortable moveUp={moveUp} moveDown={moveDown} secondary={`${department.categories.length} categorías`} />
    <div className="pl-2 sm:pl-4">{order.ordered.map((item, index) => <MasterRow key={item.id} name={item.name} active={item.isActive} count={item.productCount} countLabel="productos" canEdit={canEdit} pending={order.pending} onEdit={() => setCategory(item)} onDelete={() => deleteCategory(item.id)} deleteReason={item.productCount ? `En uso por ${item.productCount} productos. Desactívala en su lugar.` : null} sortable moveUp={index > 0 ? () => order.move(index, -1) : undefined} moveDown={index < order.ordered.length - 1 ? () => order.move(index, 1) : undefined} />)}</div>
    {canEdit && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setCategory(null)}><Plus className="size-4" /> Nueva categoría</Button>}
    {category !== undefined && <CategoryDialog key={category?.id ?? "nueva"} category={category} department={department} data={data} onClose={() => setCategory(undefined)} />}
  </section>;
}

function DepartmentDialog({ department, onClose }: { department: AdminDepartment | null; onClose: () => void }) {
  const [name, setName] = useState(department?.name ?? "");
  const [slug, setSlug] = useState(department?.slug ?? "");
  const [active, setActive] = useState(department?.isActive ?? true);
  const mutation = useMasterAction();
  const activeChildren = department?.categories.filter((item) => item.isActive).length ?? 0;
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={department ? `Editar ${department.name}` : "Nuevo departamento"} pending={mutation.pending} onSubmit={(event) => { event.preventDefault(); mutation.run(() => saveCategory({ id: department?.id, name: name.trim(), slug: slug.trim() || undefined, parentId: null, isActive: active, optionTypeId: null, requiresColor: false, attributes: [] }), "Departamento guardado", onClose); }}><TextField label="Nombre" value={name} onChange={setName} required /><details><summary className="cursor-pointer text-[12px] text-text-2">Opciones avanzadas</summary><div className="mt-3"><TextField label="Slug" value={slug} onChange={setSlug} placeholder="se genera del nombre" /></div></details><ActiveField value={active} onChange={setActive} />{!active && activeChildren > 0 && <p className="text-[12px] text-danger">Tiene {activeChildren} categorías activas. Desactívalas antes.</p>}</EditDialog>;
}

function CategoryDialog({ category, department, data, onClose }: { category: AdminCategory | null; department: AdminDepartment; data: CatalogAdminData; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [parentId, setParentId] = useState(department.id);
  const [optionTypeId, setOptionTypeId] = useState(category?.optionTypeId ?? "");
  const [requiresColor, setRequiresColor] = useState(category?.requiresColor ?? false);
  const [active, setActive] = useState(category?.isActive ?? true);
  const [attributes, setAttributes] = useState(() => [...(category?.attributes ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map(({ attributeId, required }) => ({ attributeId, required })));
  const mutation = useMasterAction();
  function toggleAttribute(id: string, checked: boolean) { setAttributes((current) => checked ? [...current, { attributeId: id, required: false }] : current.filter((item) => item.attributeId !== id)); }
  function toggleRequired(id: string, required: boolean) { setAttributes((current) => current.map((item) => item.attributeId === id ? { ...item, required } : item)); }
  return <EditDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={category ? `Editar ${category.name}` : "Nueva categoría"} pending={mutation.pending} onSubmit={(event) => { event.preventDefault(); mutation.run(() => saveCategory({ id: category?.id, name: name.trim(), slug: slug.trim() || undefined, parentId, optionTypeId: optionTypeId || null, requiresColor, isActive: active, attributes }), "Categoría guardada", onClose); }}>
    <TextField label="Nombre" value={name} onChange={setName} required />
    <SelectField label="Departamento" value={parentId} onChange={setParentId} items={data.departments} />
    <SelectField label="Tipo de opción" value={optionTypeId} onChange={setOptionTypeId} items={[{ id: "", name: "Sin opción" }, ...data.optionTypes]} />
    {!!category?.productCount && optionTypeId !== (category.optionTypeId ?? "") && <p className="rounded-lg border border-border bg-surface-2 p-3 text-[12px] text-text-2">Las variantes existentes no cambian; el editor marcará las que no correspondan.</p>}
    <label className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium">Exige color<Switch checked={requiresColor} onCheckedChange={setRequiresColor} /></label>
    <fieldset className="space-y-2"><legend className="mb-2 text-[12.5px] font-semibold">Características</legend>{data.attributes.map((attribute) => { const selected = attributes.find((item) => item.attributeId === attribute.id); return <div key={attribute.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[12.5px]"><label className="flex cursor-pointer items-center gap-2"><Checkbox checked={!!selected} onCheckedChange={(value) => toggleAttribute(attribute.id, value === true)} />{attribute.name}</label>{selected && <label className="flex items-center gap-2 text-text-2">Obligatoria<Switch size="sm" checked={selected.required} onCheckedChange={(value) => toggleRequired(attribute.id, value)} /></label>}</div>; })}</fieldset>
    <details><summary className="cursor-pointer text-[12px] text-text-2">Opciones avanzadas</summary><div className="mt-3"><TextField label="Slug" value={slug} onChange={setSlug} placeholder="se genera del nombre" /></div></details>
    <ActiveField value={active} onChange={setActive} />
  </EditDialog>;
}
