"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ImageIcon,
} from "lucide-react";
import {
  saveProduct,
  saveVariant,
  deleteVariant,
  deleteProduct,
  type FormState,
} from "@/app/(app)/productos/actions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtUSD, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product, ProductVariant } from "@/lib/database.types";

type Ref = { id: string; name: string };
type VariantWithStock = ProductVariant & { stock: number };

export function ProductEditor({
  product,
  variants,
  byBranch,
  categories,
  brands,
  canEdit,
}: {
  product: Product;
  variants: VariantWithStock[];
  byBranch: { city: string; qty: number }[];
  categories: Ref[];
  brands: Ref[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(product.is_active);
  const [visible, setVisible] = useState(product.visible_in_catalog);
  const [variantOpen, setVariantOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<VariantWithStock | null>(
    null,
  );
  const [, startTransition] = useTransition();

  const [state, formAction] = useActionState<FormState, FormData>(
    saveProduct,
    null,
  );
  useEffect(() => {
    if (state?.ok) toast.success("Producto guardado");
    else if (state?.error) toast.error(state.error);
  }, [state]);

  const totalStock = variants.reduce((a, v) => a + v.stock, 0);
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
      const res = await deleteProduct(product.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Producto eliminado");
        router.push("/productos");
      }
    });
  }
  function onDeleteVariant(v: VariantWithStock) {
    if (!confirm(`¿Eliminar la variante ${v.sku}?`)) return;
    startTransition(async () => {
      const res = await deleteVariant(v.id, product.id);
      if (res?.error) toast.error(res.error);
      else toast.success("Variante eliminada");
    });
  }

  return (
    <form
      action={formAction}
      className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12"
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
          <Card title="Galería del producto">
            <div className="grid grid-cols-4 gap-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex aspect-square items-center justify-center rounded-xl border border-border bg-surface-2 text-text-3"
                >
                  <ImageIcon className="size-6" />
                </div>
              ))}
              <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-text-3">
                <Plus className="size-5" />
                <span className="text-[11px]">Agregar</span>
              </div>
            </div>
          </Card>

          <Card title="Información">
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
            </div>
          </Card>

          <Card
            title="Variantes"
            subtitle={`${variants.length} variantes`}
            action={
              canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingVariant(null);
                    setVariantOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Agregar
                </Button>
              ) : null
            }
          >
            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.6fr_auto] border-b border-border pb-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
              <span>Variante</span>
              <span>SKU</span>
              <span className="text-right">Precio</span>
              <span className="text-right">Costo</span>
              <span className="text-right">Stock</span>
              <span />
            </div>
            {variants.map((v) => (
              <div
                key={v.id}
                className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.6fr_auto] items-center border-b border-border py-2.5 text-[12.5px]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-3.5 flex-none rounded-full border border-border"
                    style={{ background: v.color_hex ?? "var(--surface-2)" }}
                  />
                  <span className="text-foreground">
                    {[v.color, v.size].filter(Boolean).join(" / ") || "—"}
                  </span>
                </div>
                <span className="font-mono text-text-2">{v.sku}</span>
                <span className="text-right text-foreground">{fmtUSD(v.price)}</span>
                <span className="text-right text-text-2">{fmtUSD(v.cost)}</span>
                <span className="text-right text-foreground">{v.stock}</span>
                <div className="flex justify-end gap-1">
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingVariant(v);
                          setVariantOpen(true);
                        }}
                        className="iconbtn flex size-7 items-center justify-center rounded-md text-text-3"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteVariant(v)}
                        className="iconbtn flex size-7 items-center justify-center rounded-md text-text-3 hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {variants.length === 0 && (
              <div className="py-6 text-center text-[12.5px] text-text-3">
                Sin variantes. Agrega la primera.
              </div>
            )}
          </Card>
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

          <Card title="Organización">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Categoría</Label>
                <Select
                  name="category_id"
                  defaultValue={product.category_id ?? undefined}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Marca</Label>
                <Select
                  name="brand_id"
                  defaultValue={product.brand_id ?? undefined}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin marca" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tags">Etiquetas (separadas por coma)</Label>
                <Input
                  id="tags"
                  name="tags"
                  defaultValue={product.tags.join(", ")}
                  placeholder="antifluido, enfermería"
                  disabled={!canEdit}
                />
              </div>
              <input type="hidden" name="tax_rate" value={product.tax_rate} />
            </div>
          </Card>

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

      {canEdit && (
        <VariantDialog
          open={variantOpen}
          onOpenChange={setVariantOpen}
          productId={product.id}
          variant={editingVariant}
        />
      )}
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
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
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

function VariantDialog({
  open,
  onOpenChange,
  productId,
  variant,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  variant: VariantWithStock | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    saveVariant,
    null,
  );
  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{variant ? "Editar variante" : "Nueva variante"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="product_id" value={productId} />
          {variant && <input type="hidden" name="id" value={variant.id} />}
          <div className="grid grid-cols-2 gap-3">
            <Fld
              label="SKU"
              name="sku"
              defaultValue={variant?.sku}
              placeholder="Auto si se deja vacío"
            />
            <Fld label="Talla" name="size" defaultValue={variant?.size ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Color" name="color" defaultValue={variant?.color ?? ""} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color_hex">Color (hex)</Label>
              <Input
                id="color_hex"
                name="color_hex"
                type="color"
                defaultValue={variant?.color_hex ?? "#0EA5E9"}
                className="h-9 p-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Precio (USD)" name="price" type="number" step="0.01" defaultValue={variant?.price ?? 0} />
            <Fld label="Costo (USD)" name="cost" type="number" step="0.01" defaultValue={variant?.cost ?? 0} />
          </div>
          {state?.error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="font-semibold">
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Fld({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
    </div>
  );
}
