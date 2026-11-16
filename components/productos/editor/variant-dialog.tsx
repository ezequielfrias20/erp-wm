"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveVariant } from "@/app/(app)/productos/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { actionErrorMessage } from "@/lib/action-error";
import type { CatalogMasters, EditorVariant, ProductEditorData } from "@/lib/queries/catalog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  variant: EditorVariant | null;
  masters: CatalogMasters;
  colorNames: ProductEditorData["colorNames"];
  category: CatalogMasters["categories"][number] | null;
  branches: { id: string; city: string }[];
  canEditStock: boolean;
};

export function VariantDialog({ open, onOpenChange, productId, variant, masters, colorNames, category, branches, canEditStock }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [colorSearch, setColorSearch] = useState("");
  const [colorId, setColorId] = useState(variant?.colorId ?? "");
  const [optionValueId, setOptionValueId] = useState(variant?.optionValueId ?? "");
  const [active, setActive] = useState(variant?.isActive ?? true);
  const optionType = masters.optionTypes.find((item) => item.id === category?.optionTypeId);
  const selectedColor = masters.colors.find((item) => item.id === colorId);
  const currentColor = variant?.colorId ? colorNames[variant.colorId] : null;
  const currentColorUnavailable = !!variant && !!variant.colorId && (!selectedColor || !category);
  const currentOption = optionType?.values.find((item) => item.id === variant?.optionValueId);
  const currentOptionUnavailable = !!variant && !!variant.optionValueId && (!currentOption || !category);
  const visibleColors = masters.colors.filter((item) =>
    item.id === colorId || item.name.toLocaleLowerCase("es-VE").includes(colorSearch.toLocaleLowerCase("es-VE")),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (category?.requiresColor && !colorId && (!variant || colorId !== (variant.colorId ?? ""))) {
      setError("Selecciona un color para esta categoría.");
      return;
    }
    if (category?.optionTypeId && !optionValueId && (!variant || optionValueId !== (variant.optionValueId ?? ""))) {
      setError(`Selecciona ${optionType?.name?.toLocaleLowerCase("es-VE") ?? "una opción"}.`);
      return;
    }
    const formData = new FormData(event.currentTarget);
    for (const name of [...formData.keys()]) {
      if (name.startsWith("stock:") && Number(formData.get(name)) === 0) formData.delete(name);
    }
    formData.set("color_id", colorId);
    formData.set("option_value_id", variant ? optionValueId : category?.optionTypeId ? optionValueId : "");
    formData.set("is_active", active ? "true" : "false");
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveVariant(null, formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        if (result?.ok) {
          onOpenChange(false);
          router.refresh();
        }
      } catch (cause) {
        setError(actionErrorMessage(cause, "No se pudo guardar la variante."));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{variant ? "Editar variante" : "Nueva variante"}</DialogTitle>
          <DialogDescription>{category ? "Selecciona los valores del catálogo para esta variante." : "Puedes editar el SKU, precio, costo y estado de esta variante."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input type="hidden" name="product_id" value={productId} />
          {variant && <input type="hidden" name="id" value={variant.id} />}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="variant-color-search">Buscar color</Label>
            <Input id="variant-color-search" value={colorSearch} onChange={(event) => setColorSearch(event.target.value)} placeholder="Buscar por nombre" disabled={!category} />
            <Label htmlFor="variant-color">Color{category?.requiresColor ? " *" : ""}</Label>
            <Select value={colorId || "__none__"} onValueChange={(value) => setColorId(value === "__none__" ? "" : value)} disabled={!category}>
              <SelectTrigger id="variant-color" className="w-full">
                <SelectValue placeholder="Selecciona un color" />
              </SelectTrigger>
              <SelectContent>
                {(!category?.requiresColor || (variant && !variant.colorId)) && <SelectItem value="__none__">{category ? "Sin color" : "Actual: Sin color"}</SelectItem>}
                {currentColorUnavailable && variant?.colorId && (
                  <SelectItem value={variant.colorId}>Actual: {currentColor?.name ?? "Color"}{currentColor?.isActive === false ? " (inactivo)" : ""}</SelectItem>
                )}
                {visibleColors.filter((color) => !currentColorUnavailable || color.id !== variant?.colorId).map((color) => (
                  <SelectItem key={color.id} value={color.id}>
                    <span className="size-3.5 rounded-full border border-border" style={{ backgroundColor: color.hex ?? "var(--surface-2)" }} />
                    {color.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedColor && category && <p className="text-[11.5px] text-text-3">Seleccionado: {selectedColor.name}</p>}
          </div>
          {(optionType || variant) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="variant-option">{optionType?.name ?? "Opción"}{optionType && category?.optionTypeId ? " *" : ""}</Label>
              <Select value={optionValueId || "__none__"} onValueChange={(value) => setOptionValueId(value === "__none__" ? "" : value)} disabled={!category || !optionType}>
                <SelectTrigger id="variant-option" className="w-full"><SelectValue placeholder={optionType ? `Selecciona ${optionType.name.toLocaleLowerCase("es-VE")}` : "Sin opción"} /></SelectTrigger>
                <SelectContent>
                  {variant && !variant.optionValueId && <SelectItem value="__none__">Actual: Sin opción</SelectItem>}
                  {currentOptionUnavailable && variant?.optionValueId && <SelectItem value={variant.optionValueId}>Actual</SelectItem>}
                  {optionType?.values.map((value) => <SelectItem key={value.id} value={value.id}>{value.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {!category && <p className="text-[12px] text-text-2">Guarda una categoría para cambiar color u opción.</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="variant-sku">SKU (opcional)</Label>
            <Input id="variant-sku" name="sku" defaultValue={variant?.sku ?? ""} placeholder="Se genera solo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="variant-price">Precio (USD)</Label>
              <Input id="variant-price" name="price" type="number" min="0" step="0.01" required defaultValue={variant?.price ?? 0} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="variant-cost">Costo (USD)</Label>
              <Input id="variant-cost" name="cost" type="number" min="0" step="0.01" required defaultValue={variant?.cost ?? 0} />
            </div>
          </div>
          {!variant && canEditStock && branches.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-[12.5px] font-semibold text-foreground">Stock inicial por sucursal</p>
              {branches.map((branch) => (
                <div key={branch.id} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`variant-stock-${branch.id}`}>{branch.city}</Label>
                  <Input id={`variant-stock-${branch.id}`} name={`stock:${branch.id}`} type="number" min="0" step="1" required defaultValue={0} className="w-28" />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="variant-active">Activa</Label>
            <Switch id="variant-active" checked={active} onCheckedChange={setActive} />
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
