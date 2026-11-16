"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Product } from "@/lib/database.types";
import type { CatalogMasters } from "@/lib/queries/catalog";

type Props = {
  product: Product;
  masters: CatalogMasters;
  attributeValueIds: string[];
  canEdit: boolean;
};

const NONE = "__none__";

export function ClassificationCard({ product, masters, attributeValueIds, canEdit }: Props) {
  // Los ids actuales se conservan aunque no estén entre los maestros activos (maestro inactivo o
  // producto asignado a un departamento): el servidor no toca un valor que no cambió.
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");
  const [brandId, setBrandId] = useState(product.brand_id ?? "");
  const [lineId, setLineId] = useState(product.line_id ?? "");
  const [selectedValues, setSelectedValues] = useState(attributeValueIds);
  const currentCategoryUnavailable = Boolean(product.category_id) && !masters.categories.some((item) => item.id === product.category_id);
  const currentBrandUnavailable = Boolean(product.brand_id) && !masters.brands.some((item) => item.id === product.brand_id);

  const category = masters.categories.find((item) => item.id === categoryId);
  const brand = masters.brands.find((item) => item.id === brandId);
  const attributes = [...(category?.attributes ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => ({ ...entry, attribute: masters.attributes.find((item) => item.id === entry.attributeId) }))
    .filter((entry) => entry.attribute !== undefined);
  const submittedValues = attributes.flatMap(({ attribute }) => {
    if (!attribute) return [];
    const ownValues = selectedValues.filter((id) => attribute.values.some((value) => value.id === id));
    return attribute.isMulti ? ownValues : ownValues.slice(0, 1);
  });
  // Valores guardados que ya no están activos: se reenvían mientras la categoría no cambie.
  const knownValueIds = new Set(masters.attributes.flatMap((attribute) => attribute.values.map((value) => value.id)));
  const keptValues = categoryId === (product.category_id ?? "") ? attributeValueIds.filter((id) => !knownValueIds.has(id)) : [];
  const lineUnchanged = brandId === (product.brand_id ?? "") && lineId === (product.line_id ?? "");
  const submittedLineId = lineUnchanged || brand?.lines.some((line) => line.id === lineId) ? lineId : "";

  function changeCategory(value: string) {
    const nextId = value === NONE ? "" : value;
    const nextCategory = masters.categories.find((item) => item.id === nextId);
    const nextAttributeIds = new Set(nextCategory?.attributes.map((item) => item.attributeId) ?? []);
    const nextValueIds = new Set(masters.attributes
      .filter((item) => nextAttributeIds.has(item.id))
      .flatMap((item) => item.values.map((value) => value.id)));
    setSelectedValues((current) => current.filter((id) => nextValueIds.has(id)));
    setCategoryId(nextId);
  }

  function changeSingle(attributeId: string, valueId: string) {
    const ownValues = new Set(masters.attributes.find((item) => item.id === attributeId)?.values.map((value) => value.id) ?? []);
    setSelectedValues((current) => [
      ...current.filter((id) => !ownValues.has(id)),
      ...(valueId === NONE ? [] : [valueId]),
    ]);
  }

  function changeMulti(valueId: string, checked: boolean) {
    setSelectedValues((current) => checked
      ? [...current.filter((id) => id !== valueId), valueId]
      : current.filter((id) => id !== valueId));
  }

  return (
    <div id="clasificacion" className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
      <div className="mb-4 text-[14px] font-bold tracking-tight text-foreground">Clasificación</div>
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="brand_id" value={brandId} />
      <input type="hidden" name="line_id" value={submittedLineId} />
      <input type="hidden" name="attributes_submitted" value="1" />
      {[...submittedValues, ...keptValues].map((id) => <input key={id} type="hidden" name="attribute_value_ids" value={id} />)}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Categoría</Label>
          <Select value={categoryId || NONE} onValueChange={changeCategory} disabled={!canEdit}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Sin categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin categoría</SelectItem>
              {currentCategoryUnavailable && <SelectItem value={product.category_id!}>Actual (no asignable)</SelectItem>}
              {masters.departments.map((department) => {
                const categories = masters.categories.filter((item) => item.departmentId === department.id);
                return categories.length ? (
                  <SelectGroup key={department.id}>
                    <SelectLabel>{department.name}</SelectLabel>
                    {categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectGroup>
                ) : null;
              })}
            </SelectContent>
          </Select>
          {categoryId !== (product.category_id ?? "") && (
            <p className="text-[11.5px] text-text-3">
              Al guardar, se quitarán las características que no correspondan a esta categoría.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Marca</Label>
          <Select value={brandId || NONE} onValueChange={(value) => { setBrandId(value === NONE ? "" : value); setLineId(""); }} disabled={!canEdit}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Sin marca" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin marca</SelectItem>
              {currentBrandUnavailable && <SelectItem value={product.brand_id!}>Actual (inactiva)</SelectItem>}
              {masters.brands.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {brand && brand.lines.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label>Línea</Label>
            <Select value={lineId || NONE} onValueChange={(value) => setLineId(value === NONE ? "" : value)} disabled={!canEdit}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Sin línea" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin línea</SelectItem>
                {product.line_id && brandId === (product.brand_id ?? "") && !brand.lines.some((line) => line.id === product.line_id) && (
                  <SelectItem value={product.line_id}>Actual (inactiva)</SelectItem>
                )}
                {brand.lines.map((line) => <SelectItem key={line.id} value={line.id}>{line.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {attributes.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="mb-3 text-[12.5px] font-semibold text-foreground">Características</div>
            <div className="flex flex-col gap-3">
              {attributes.map(({ attributeId, required, attribute }) => {
                if (!attribute) return null;
                const selected = submittedValues.filter((id) => attribute.values.some((value) => value.id === id));
                return (
                  <div key={attributeId} className="flex flex-col gap-1.5">
                    <Label>
                      {attribute.name}{required && <span className="ml-1 text-danger" aria-label="Obligatorio">*</span>}
                    </Label>
                    {attribute.isMulti ? (
                      <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
                        {attribute.values.map((value) => (
                          <label key={value.id} className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground">
                            <Checkbox checked={selected.includes(value.id)} onCheckedChange={(checked) => changeMulti(value.id, checked === true)} disabled={!canEdit} />
                            {value.name}
                          </label>
                        ))}
                        {attribute.values.length === 0 && <span className="text-[12px] text-text-3">Sin valores disponibles.</span>}
                      </div>
                    ) : (
                      <Select value={selected[0] ?? NONE} onValueChange={(value) => changeSingle(attributeId, value)} disabled={!canEdit || attribute.values.length === 0}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Sin seleccionar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Sin seleccionar</SelectItem>
                          {attribute.values.map((value) => <SelectItem key={value.id} value={value.id}>{value.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tags">Etiquetas (separadas por coma)</Label>
          <Input id="tags" name="tags" defaultValue={product.tags.join(", ")} placeholder="antifluido, enfermería" disabled={!canEdit} />
        </div>
        <input type="hidden" name="tax_rate" value={product.tax_rate} />
      </div>
    </div>
  );
}
