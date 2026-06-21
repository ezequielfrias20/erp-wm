"use client";

import { useMemo, useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Plus, Search, Loader2, ChevronRight } from "lucide-react";
import { saveProduct, type FormState } from "@/app/(app)/productos/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtUSD, fmtNum, initials } from "@/lib/format";
import { ProductsBulkBar } from "@/components/productos/bulk-bar";
import type { VProductSummary } from "@/lib/database.types";

type Ref = { id: string; name: string };

export function ProductsView({
  products,
  categories,
  brands,
  sizes,
  colors,
  canEdit,
}: {
  products: VProductSummary[];
  categories: Ref[];
  brands: Ref[];
  sizes: { id: string; label: string }[];
  colors: { id: string; name: string; hex: string | null }[];
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [products, query]);

  return (
    <div className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12">
      <div className="fadeup mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            Productos
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            {products.length} productos en catálogo
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <ProductsBulkBar
              lists={{
                categories: categories.map((c) => c.name),
                brands: brands.map((b) => b.name),
                sizes: sizes.map((s) => s.label),
                colors: colors.map((c) => c.name),
              }}
            />
            <button
              onClick={() => setOpen(true)}
              className="hoverlift flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-[15px] text-[13px] font-semibold text-white"
            >
              <Plus className="size-4" /> Nuevo producto
            </button>
          </div>
        )}
      </div>

      <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
        <div className="border-b border-border p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-text-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, marca o categoría…"
              className="h-[38px] w-full rounded-[10px] border border-border bg-surface-2 pr-3 pl-[37px] text-[13px] text-foreground outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr_0.6fr_auto] border-b border-border px-[22px] py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
          <span>Producto</span>
          <span>Categoría</span>
          <span>Marca</span>
          <span className="text-right">Precio</span>
          <span className="text-right">Stock</span>
          <span className="text-right">Estado</span>
          <span />
        </div>

        {filtered.map((p) => (
          <Link
            key={p.id}
            href={`/productos/${p.id}`}
            className="tr-row grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr_0.6fr_auto] items-center border-b border-border px-[22px] py-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-surface-2 text-[11px] font-bold text-text-2">
                {initials(p.name)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium text-foreground">
                  {p.name}
                </div>
                <div className="text-[11px] text-text-3">
                  {p.variant_count} variantes
                </div>
              </div>
            </div>
            <span className="text-[12px] text-text-2">{p.category ?? "—"}</span>
            <span className="text-[12px] text-text-2">{p.brand ?? "—"}</span>
            <span className="text-right text-[12.5px] font-medium text-foreground">
              {p.min_price === p.max_price
                ? fmtUSD(p.min_price)
                : `${fmtUSD(p.min_price)}–${fmtUSD(p.max_price)}`}
            </span>
            <span className="text-right text-[12.5px] text-foreground">
              {fmtNum(p.total_stock)}
            </span>
            <span className="text-right">
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={
                  p.is_active
                    ? { background: "var(--success-soft)", color: "var(--success)" }
                    : { background: "var(--surface-2)", color: "var(--text-3)" }
                }
              >
                {p.is_active ? "Activo" : "Inactivo"}
              </span>
            </span>
            <ChevronRight className="size-4 text-text-3" />
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="px-[22px] py-10 text-center text-[13px] text-text-3">
            No hay productos que coincidan.
          </div>
        )}
      </div>

      {canEdit && (
        <CreateDialog
          open={open}
          onOpenChange={setOpen}
          categories={categories}
          brands={brands}
        />
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" />}
      Crear y editar
    </Button>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  categories,
  brands,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: Ref[];
  brands: Ref[];
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<FormState, FormData>(
    saveProduct,
    null,
  );

  useEffect(() => {
    if (state?.ok && state.id) {
      onOpenChange(false);
      router.push(`/productos/${state.id}`);
    }
  }, [state, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="is_active" value="true" />
          <input type="hidden" name="visible_in_catalog" value="true" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre del producto</Label>
            <Input id="name" name="name" placeholder="Ej. Scrub Set Cherokee Workwear" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Categoría</Label>
              <Select name="category_id">
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
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
              <Select name="brand_id">
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
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
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
