"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { generateVariants } from "@/app/(app)/productos/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionErrorMessage } from "@/lib/action-error";
import { missingCombinations, variantKey } from "@/lib/catalog/variants";
import type { CatalogMasters, EditorVariant } from "@/lib/queries/catalog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  variants: EditorVariant[];
  masters: CatalogMasters;
  category: CatalogMasters["categories"][number];
};

export function GenerateVariantsDialog({ open, onOpenChange, productId, variants, masters, category }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [colorSearch, setColorSearch] = useState("");
  const [colorIds, setColorIds] = useState<(string | null)[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const optionType = masters.optionTypes.find((item) => item.id === category.optionTypeId);
  const optionValueIds = optionType ? selectedOptionIds : [null];
  const missing = missingCombinations(variants, colorIds, optionValueIds);
  const missingKeys = new Set(missing.map((item) => variantKey(item.colorId, item.optionValueId)));
  const combinations = colorIds.flatMap((colorId) => optionValueIds.map((optionValueId) => ({ colorId, optionValueId })));
  const tooMany = combinations.length > 300;
  const colorNames = new Map(masters.colors.map((item) => [item.id, item.name]));
  const optionNames = new Map(optionType?.values.map((item) => [item.id, item.label]) ?? []);
  const visibleColors = masters.colors.filter((item) => item.name.toLocaleLowerCase("es-VE").includes(colorSearch.toLocaleLowerCase("es-VE")));

  function toggleColor(id: string | null, checked: boolean) {
    setColorIds((current) => checked ? [...current, id] : current.filter((item) => item !== id));
  }

  function toggleOption(id: string, checked: boolean) {
    setSelectedOptionIds((current) => checked ? [...current, id] : current.filter((item) => item !== id));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !missing.length || tooMany) return;
    const data = new FormData(event.currentTarget);
    const price = Number(data.get("price"));
    const cost = Number(data.get("cost"));
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(cost) || cost < 0) {
      setError("El precio y el costo deben ser números no negativos.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateVariants({ productId, colorIds, optionValueIds, price, cost });
        if (result?.error) {
          setError(result.error);
          return;
        }
        if (result?.ok) {
          toast.success(`Se crearon ${result.created ?? 0} variantes`);
          onOpenChange(false);
          router.refresh();
        }
      } catch (cause) {
        setError(actionErrorMessage(cause, "No se pudieron generar las variantes."));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Generar combinaciones</DialogTitle>
          <DialogDescription>Marca los colores y {optionType ? `valores de ${optionType.name.toLocaleLowerCase("es-VE")}` : "la opción disponible"}. Cada combinación nueva tendrá SKU automático y stock inicial cero.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="min-w-0 rounded-lg border border-border p-3">
              <legend className="px-1 text-[12.5px] font-semibold text-foreground">Colores</legend>
              <Label htmlFor="generate-color-search" className="sr-only">Buscar color</Label>
              <Input id="generate-color-search" value={colorSearch} onChange={(event) => setColorSearch(event.target.value)} placeholder="Buscar color" className="mb-2" />
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {!category.requiresColor && (
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                    <Checkbox checked={colorIds.includes(null)} onCheckedChange={(checked) => toggleColor(null, checked === true)} />
                    <span className="size-3.5 rounded-full border border-border bg-surface-2" />
                    Sin color
                  </label>
                )}
                {visibleColors.map((color) => (
                  <label key={color.id} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                    <Checkbox checked={colorIds.includes(color.id)} onCheckedChange={(checked) => toggleColor(color.id, checked === true)} />
                    <span className="size-3.5 rounded-full border border-border" style={{ backgroundColor: color.hex ?? "var(--surface-2)" }} />
                    <span className="truncate">{color.name}</span>
                  </label>
                ))}
                {visibleColors.length === 0 && <p className="text-[12px] text-text-3">No hay colores con ese nombre.</p>}
              </div>
            </fieldset>
            <fieldset className="min-w-0 rounded-lg border border-border p-3">
              <legend className="px-1 text-[12.5px] font-semibold text-foreground">{optionType?.name ?? "Opción"}</legend>
              {optionType ? (
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {optionType.values.map((value) => (
                    <label key={value.id} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                      <Checkbox checked={selectedOptionIds.includes(value.id)} onCheckedChange={(checked) => toggleOption(value.id, checked === true)} />
                      {value.label}
                    </label>
                  ))}
                  {optionType.values.length === 0 && <p className="text-[12px] text-text-3">No hay valores disponibles.</p>}
                </div>
              ) : <p className="text-[12.5px] text-text-2">Sin opción (única)</p>}
            </fieldset>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-[12.5px] font-semibold text-foreground">{missing.length} combinaciones por crear</p>
            {tooMany && <p role="alert" className="mt-1 text-[12px] text-danger">Selecciona hasta 300 combinaciones por vez.</p>}
            {combinations.length === 0 ? (
              <p className="mt-2 text-[12px] text-text-3">Selecciona al menos un color{optionType ? " y una opción" : ""}.</p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[12px]">
                {combinations.map(({ colorId, optionValueId }) => {
                  const exists = !missingKeys.has(variantKey(colorId, optionValueId));
                  return (
                    <li key={variantKey(colorId, optionValueId)} className={`flex justify-between gap-3 rounded px-2 py-1 ${exists ? "text-text-3" : "text-foreground"}`}>
                      <span>{colorId ? colorNames.get(colorId) ?? "Color desconocido" : "Sin color"} / {optionValueId ? optionNames.get(optionValueId) ?? "Opción desconocida" : "Sin opción"}</span>
                      <span className="shrink-0">{exists ? "ya existe" : "nueva"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="generate-price">Precio (USD)</Label>
              <Input id="generate-price" name="price" type="number" min="0" step="0.01" required defaultValue={0} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="generate-cost">Costo (USD)</Label>
              <Input id="generate-cost" name="cost" type="number" min="0" step="0.01" required defaultValue={0} />
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending || missing.length === 0 || tooMany}>{pending ? "Generando…" : "Generar variantes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
