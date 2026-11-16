"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { deleteVariant } from "@/app/(app)/productos/actions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GenerateVariantsDialog } from "@/components/productos/editor/generate-variants-dialog";
import { VariantDialog } from "@/components/productos/editor/variant-dialog";
import { reportActionError } from "@/lib/action-error";
import { variantDeleteBlockers, type DeleteBlocker } from "@/lib/catalog/variants";
import { fmtNum, fmtUSD } from "@/lib/format";
import type { CatalogMasters, EditorVariant } from "@/lib/queries/catalog";

type Props = {
  productId: string;
  variants: EditorVariant[];
  masters: CatalogMasters;
  category: CatalogMasters["categories"][number] | null;
  branches: { id: string; city: string }[];
  canEdit: boolean;
  canEditStock: boolean;
};

const blockerLabels: Record<DeleteBlocker, string> = {
  sales: "ventas",
  purchases: "compras",
  stock: "stock",
  aliases: "SKU anteriores",
};

export function VariantsCard({ productId, variants, masters, category, branches, canEdit, canEditStock }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingVariant, setEditingVariant] = useState<EditorVariant | null>(null);
  const [variantOpen, setVariantOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);

  const optionType = masters.optionTypes.find((item) => item.id === category?.optionTypeId);
  const optionOrder = new Map(optionType?.values.map((item, index) => [item.id, index]) ?? []);
  const optionLabels = new Map(masters.optionTypes.flatMap((type) => type.values.map((value) => [value.id, value.label] as const)));
  const colorsById = new Map(masters.colors.map((color) => [color.id, color]));
  const sortedBySku = [...variants].sort((a, b) => a.sku.localeCompare(b.sku, "es-VE", { numeric: true }));
  const groups = new Map<string | null, EditorVariant[]>();
  for (const variant of sortedBySku) {
    const group = groups.get(variant.colorId) ?? [];
    group.push(variant);
    groups.set(variant.colorId, group);
  }
  const groupIds: (string | null)[] = [...groups.keys()].filter((id): id is string => id !== null);
  if (groups.has(null)) groupIds.push(null);

  function removeVariant(variant: EditorVariant) {
    if (pending || !confirm(`¿Eliminar la variante ${variant.sku}?`)) return;
    startTransition(async () => {
      try {
        const result = await deleteVariant(variant.id, productId);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        if (result?.ok) {
          toast.success("Variante eliminada");
          router.refresh();
        }
      } catch (error) {
        reportActionError(error, "No se pudo eliminar la variante.");
      }
    });
  }

  return (
    <div id="variantes" className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-bold tracking-tight text-foreground">Variantes</div>
          <div className="text-[12px] text-text-3">{variants.length} variantes</div>
        </div>
        {canEdit && category && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setEditingVariant(null); setVariantOpen(true); }}>
              <Plus className="size-4" /> Agregar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setGeneratorOpen(true)}>
              <WandSparkles className="size-4" /> Generar combinaciones
            </Button>
          </div>
        )}
      </div>
      {!category && (
        <p className="mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text-2">
          Elige y guarda la categoría para crear variantes
        </p>
      )}
      {variants.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-text-3">Sin variantes. {canEdit && category ? "Agrega la primera o genera combinaciones." : ""}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[920px]">
            <div className={`grid ${canEdit ? "grid-cols-[1fr_1.5fr_0.8fr_0.8fr_1.6fr_0.7fr_4rem]" : "grid-cols-[1fr_1.5fr_0.8fr_0.8fr_1.6fr_0.7fr]"} gap-3 border-b border-border pb-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase`}>
              <span>{optionType?.name ?? "Opción"}</span>
              <span>SKU</span>
              <span className="text-right">Precio</span>
              <span className="text-right">Costo</span>
              <span>Stock por sucursal</span>
              <span>Estado</span>
              {canEdit && <span className="text-right">Acciones</span>}
            </div>
            <TooltipProvider>
              {groupIds.map((colorId) => {
                const color = colorId ? colorsById.get(colorId) : null;
                const rows = [...(groups.get(colorId) ?? [])].sort((a, b) =>
                  (optionOrder.get(a.optionValueId ?? "") ?? Number.MAX_SAFE_INTEGER) - (optionOrder.get(b.optionValueId ?? "") ?? Number.MAX_SAFE_INTEGER)
                  || a.sku.localeCompare(b.sku, "es-VE", { numeric: true }),
                );
                return (
                  <section key={colorId ?? "__none__"} aria-label={color?.name ?? (colorId ? "Color no disponible" : "Sin color")}>
                    <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-2 py-2 text-[12.5px] font-semibold text-foreground">
                      <span className="size-3.5 shrink-0 rounded-full border border-border" style={{ backgroundColor: color?.hex ?? "var(--surface-2)" }} />
                      {color?.name ?? (colorId ? "Color no disponible" : "Sin color")}
                      <span className="text-[11px] font-normal text-text-3">({rows.length})</span>
                    </div>
                    {rows.map((variant) => {
                      const blockers = variantDeleteBlockers({
                        saleLines: variant.saleLines,
                        purchaseLines: variant.purchaseLines,
                        stock: Object.values(variant.stockByBranch).reduce((sum, quantity) => sum + quantity, 0),
                        aliases: variant.aliases.length,
                      });
                      const deleteReason = `No se puede eliminar: tiene ${blockers.map((item) => blockerLabels[item]).join(", ")}. Desactívala desde Editar.`;
                      return (
                        <div key={variant.id} className={`grid ${canEdit ? "grid-cols-[1fr_1.5fr_0.8fr_0.8fr_1.6fr_0.7fr_4rem]" : "grid-cols-[1fr_1.5fr_0.8fr_0.8fr_1.6fr_0.7fr]"} items-center gap-3 border-b border-border px-2 py-2.5 text-[12.5px]`}>
                          <span className="text-foreground">{variant.optionValueId ? optionLabels.get(variant.optionValueId) ?? "—" : "—"}</span>
                          <span className="min-w-0 font-mono text-text-2">
                            <span className="break-all">{variant.sku}</span>
                            {variant.aliases.length > 0 && <small className="block font-sans text-[11px] text-text-3">antes: {variant.aliases.join(", ")}</small>}
                          </span>
                          <span className="text-right text-foreground">{fmtUSD(variant.price)}</span>
                          <span className="text-right text-text-2">{fmtUSD(variant.cost)}</span>
                          <span className="text-text-2">{branches.length ? branches.map((branch) => `${branch.city}: ${fmtNum(variant.stockByBranch[branch.id] ?? 0)}`).join(" · ") : "—"}</span>
                          <span className={variant.isActive ? "text-foreground" : "text-text-3"}>{variant.isActive ? "Activa" : "Inactiva"}</span>
                          {canEdit && (
                            <span className="flex justify-end gap-1">
                              <button type="button" aria-label={`Editar ${variant.sku}`} title={category ? "Editar variante" : "Guarda una categoría para editar"} disabled={!category || pending} onClick={() => { setEditingVariant(variant); setVariantOpen(true); }} className="iconbtn flex size-7 items-center justify-center rounded-md text-text-3 disabled:cursor-not-allowed disabled:opacity-40">
                                <Pencil className="size-3.5" />
                              </button>
                              {blockers.length > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={0} aria-label={deleteReason} className="inline-flex cursor-not-allowed">
                                      <button type="button" aria-label={`Eliminar ${variant.sku}`} disabled className="iconbtn flex size-7 items-center justify-center rounded-md text-text-3 opacity-40"><Trash2 className="size-3.5" /></button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>{deleteReason}</TooltipContent>
                                </Tooltip>
                              ) : (
                                <button type="button" aria-label={`Eliminar ${variant.sku}`} title="Eliminar variante" disabled={pending} onClick={() => removeVariant(variant)} className="iconbtn flex size-7 items-center justify-center rounded-md text-text-3 hover:text-danger disabled:opacity-40">
                                  <Trash2 className="size-3.5" />
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </TooltipProvider>
          </div>
        </div>
      )}
      {canEdit && category && variantOpen && (
        <VariantDialog key={editingVariant?.id ?? "new"} open={variantOpen} onOpenChange={setVariantOpen} productId={productId} variant={editingVariant} masters={masters} category={category} branches={branches} canEditStock={canEditStock} />
      )}
      {canEdit && category && generatorOpen && (
        <GenerateVariantsDialog open={generatorOpen} onOpenChange={setGeneratorOpen} productId={productId} variants={variants} masters={masters} category={category} />
      )}
    </div>
  );
}
