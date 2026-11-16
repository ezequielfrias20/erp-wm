"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import { reportActionError } from "@/lib/action-error";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import {
  saveProduct,
  deleteProduct,
  type FormState,
} from "@/app/(app)/productos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { fmtUSD, fmtNum } from "@/lib/format";
import type { CatalogMasters, ProductEditorData } from "@/lib/queries/catalog";
import { ClassificationCard } from "@/components/productos/editor/classification-card";
import { SpecsEditor } from "@/components/productos/editor/specs-editor";
import { ReadinessBadge } from "@/components/productos/editor/readiness-badge";
import { ColorsPhotosCard } from "@/components/productos/editor/colors-photos-card";
import { VariantsCard } from "@/components/productos/editor/variants-card";

export function ProductEditor({
  editorData,
  masters,
  canEdit,
  canEditStock,
}: {
  editorData: ProductEditorData;
  masters: CatalogMasters;
  canEdit: boolean;
  canEditStock: boolean;
}) {
  const { product, variants, branches } = editorData;
  const colorsById = new Map(masters.colors.map((color) => [color.id, color.name] as const));
  const category = masters.categories.find((item) => item.id === product.category_id) ?? null;
  const router = useRouter();
  const [active, setActive] = useState(product.is_active);
  const [visible, setVisible] = useState(product.visible_in_catalog);
  const [, startTransition] = useTransition();

  const [state, formAction] = useActionState<FormState, FormData>(
    saveProduct,
    null,
  );
  useEffect(() => {
    if (state?.ok) {
      toast.success("Producto guardado");
      router.refresh();
    }
    else if (state?.error) toast.error(state.error);
  }, [state, router]);

  const stockOf = (stockByBranch: Record<string, number>) =>
    Object.values(stockByBranch).reduce((sum, qty) => sum + qty, 0);
  const totalStock = variants.reduce((a, v) => a + stockOf(v.stockByBranch), 0);
  const byBranch = branches
    .map((branch) => ({
      city: branch.city,
      qty: variants.reduce((sum, v) => sum + (v.stockByBranch[branch.id] ?? 0), 0),
    }))
    .filter((branch) => branch.qty !== 0);
  const minPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : 0;
  const maxPrice = variants.length ? Math.max(...variants.map((v) => v.price)) : 0;
  const avgCost = variants.length
    ? variants.reduce((a, v) => a + v.cost, 0) / variants.length
    : 0;
  const avgPrice = variants.length
    ? variants.reduce((a, v) => a + v.price, 0) / variants.length
    : 0;
  const margin = avgPrice > 0 ? ((avgPrice - avgCost) / avgPrice) * 100 : 0;
  const branchMax = Math.max(1, ...byBranch.map((b) => b.qty));

  function onDeleteProduct() {
    if (!confirm(`¿Eliminar "${product.name}" y todas sus variantes?`)) return;
    startTransition(async () => {
      try {
        const res = await deleteProduct(product.id);
        if (res?.error) toast.error(res.error);
        else {
          toast.success("Producto eliminado");
          router.push("/productos");
        }
      } catch (error) {
        reportActionError(error, "No se pudo eliminar el producto.");
      }
    });
  }

  return (
    <form
      action={formAction}
      className="mx-auto max-w-[1560px] px-4 pt-4 pb-8 sm:px-5 sm:pt-5 lg:px-[30px] lg:pt-[26px] lg:pb-12"
    >
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="is_active" value={active ? "true" : "false"} />
      <input
        type="hidden"
        name="visible_in_catalog"
        value={visible ? "true" : "false"}
      />
      <div className="fadeup mb-[22px] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/productos"
            className="iconbtn flex size-9 items-center justify-center rounded-lg border border-border bg-card text-text-2"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="text-[11.5px] text-text-3">
              Productos / {product.id.slice(0, 8)}
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-bold tracking-tight text-foreground">
                {product.name}
              </h1>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={
                  active
                    ? { background: "var(--success-soft)", color: "var(--success)" }
                    : { background: "var(--surface-2)", color: "var(--text-3)" }
                }
              >
                {active ? "Activo" : "Inactivo"}
              </span>
              <ReadinessBadge
                readiness={editorData.readiness}
                masters={masters}
                colorsById={colorsById}
                categoryId={product.category_id}
              />
            </div>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={onDeleteProduct}
              className="text-danger"
            >
              <Trash2 className="size-4" /> Eliminar
            </Button>
            <SaveButton />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        {/* Left */}
        <div className="flex flex-col gap-[18px]">
          <ColorsPhotosCard
            productId={product.id}
            media={editorData.media}
            variants={variants}
            colors={masters.colors}
            canEdit={canEdit}
          />

          <Card id="informacion" title="Información">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nombre del producto</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={product.name}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={4}
                  defaultValue={product.description ?? ""}
                  disabled={!canEdit}
                />
              </div>
              <SpecsEditor specs={product.specs ?? []} canEdit={canEdit} />
            </div>
          </Card>

          <VariantsCard
            productId={product.id}
            variants={variants}
            masters={masters}
            category={category}
            branches={branches}
            canEdit={canEdit}
            canEditStock={canEditStock}
          />
        </div>

        {/* Right */}
        <div className="flex flex-col gap-[18px]">
          <Card title="Estado">
            <div className="flex flex-col gap-3">
              <Row label="Activo">
                <Switch checked={active} onCheckedChange={setActive} disabled={!canEdit} />
              </Row>
              <Row label="Visible en catálogo">
                <Switch checked={visible} onCheckedChange={setVisible} disabled={!canEdit} />
              </Row>
            </div>
          </Card>

          <Card title="Precios">
            <div className="flex flex-col gap-2.5 text-[12.5px]">
              <Row label="Precio de venta">
                <span className="font-semibold text-foreground">
                  {minPrice === maxPrice
                    ? fmtUSD(minPrice)
                    : `${fmtUSD(minPrice)}–${fmtUSD(maxPrice)}`}
                </span>
              </Row>
              <Row label="Costo promedio">
                <span className="text-foreground">{fmtUSD(avgCost)}</span>
              </Row>
              <Row label="Margen">
                <span className="font-semibold text-success">
                  {margin.toFixed(1)}%
                </span>
              </Row>
              <Row label="Impuesto (IVA)">
                <span className="text-foreground">{product.tax_rate}%</span>
              </Row>
            </div>
          </Card>

          <ClassificationCard product={product} masters={masters} attributeValueIds={editorData.attributeValueIds} canEdit={canEdit} />

          <Card title="Inventario" subtitle={`${fmtNum(totalStock)} uds`}>
            <div className="flex flex-col gap-3">
              {byBranch.length === 0 && (
                <div className="text-[12px] text-text-3">Sin existencias registradas.</div>
              )}
              {byBranch.map((b) => (
                <div key={b.city}>
                  <div className="mb-1 flex justify-between text-[12px]">
                    <span className="text-text-2">{b.city}</span>
                    <span className="font-medium text-foreground">{b.qty}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(b.qty / branchMax) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" />}
      Guardar cambios
    </Button>
  );
}

function Card({
  id,
  title,
  subtitle,
  action,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[14px] font-bold tracking-tight text-foreground">
            {title}
          </div>
          {subtitle && (
            <div className="text-[12px] text-text-3">{subtitle}</div>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] text-text-2">{label}</span>
      {children}
    </div>
  );
}
