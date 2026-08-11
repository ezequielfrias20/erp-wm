"use client";

import { useMemo, useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Plus, Search, Loader2, ChevronRight, X } from "lucide-react";
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
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtUSD, fmtNum, initials } from "@/lib/format";
import { matchesProductQuery } from "@/lib/search";
import { ProductsBulkBar } from "@/components/productos/bulk-bar";
import type { ProductListItem } from "@/lib/database.types";

type Ref = { id: string; name: string };

export function ProductsView({
  products,
  categories,
  brands,
  sizes,
  colors,
  canEdit,
}: {
  products: ProductListItem[];
  categories: Ref[];
  brands: Ref[];
  sizes: { id: string; label: string }[];
  colors: { id: string; name: string; hex: string | null }[];
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [failedProductImages, setFailedProductImages] = useState<Record<string, true>>({});

  const filterOptions = useMemo(
    () => ({
      categories: uniqueSorted(products.map((p) => p.category)),
      brands: uniqueSorted(products.map((p) => p.brand)),
      sizes: uniqueSorted(products.flatMap((p) => p.sizes)),
      colors: uniqueSorted(products.flatMap((p) => p.colors.map((c) => c.name))),
    }),
    [products],
  );
  const hasFilters = Boolean(query.trim() || cat || brand || size || color);

  const filtered = useMemo(() => {
    let list = products;
    if (cat) list = list.filter((p) => p.category === cat);
    if (brand) list = list.filter((p) => p.brand === brand);
    if (size) list = list.filter((p) => p.sizes.includes(size));
    if (color) list = list.filter((p) => p.colors.some((c) => c.name === color));
    if (query.trim()) {
      list = list.filter(
        (p) => matchesProductQuery([
          p.name,
          p.skus,
          p.brand,
          p.category,
          p.sizes,
          p.colors.map((c) => c.name),
        ], query),
      );
    }
    return list;
  }, [products, cat, brand, size, color, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  return (
    <div className="mx-auto max-w-[1560px] px-4 pt-4 pb-8 sm:px-5 sm:pt-5 lg:px-[30px] lg:pt-[26px] lg:pb-12">
      <div className="fadeup mb-[22px] flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            Productos
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            {fmtNum(filtered.length)} de {fmtNum(products.length)} productos en catálogo
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
              className="hoverlift flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-brand px-[15px] text-[13px] font-semibold text-white sm:h-[38px] sm:flex-none"
            >
              <Plus className="size-4" /> Nuevo producto
            </button>
          </div>
        )}
      </div>

      <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-0 flex-1 sm:min-w-[260px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-text-3" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre, talla, color, marca o categoría…"
              className="h-11 w-full rounded-[10px] border border-border bg-surface-2 pr-3 pl-[37px] text-[16px] text-foreground outline-none sm:h-[38px] sm:text-[13px]"
            />
          </div>
          <FilterSelect
            value={cat}
            onChange={(value) => {
              setCat(value);
              setPage(1);
            }}
            placeholder="Categoría"
            options={filterOptions.categories}
          />
          <FilterSelect
            value={brand}
            onChange={(value) => {
              setBrand(value);
              setPage(1);
            }}
            placeholder="Marca"
            options={filterOptions.brands}
          />
          <FilterSelect
            value={size}
            onChange={(value) => {
              setSize(value);
              setPage(1);
            }}
            placeholder="Talla"
            options={filterOptions.sizes}
          />
          <FilterSelect
            value={color}
            onChange={(value) => {
              setColor(value);
              setPage(1);
            }}
            placeholder="Color"
            options={filterOptions.colors}
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCat("");
                setBrand("");
                setSize("");
                setColor("");
                setPage(1);
              }}
              className="iconbtn flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-3 text-[13px] font-medium text-text-2 sm:h-[38px] sm:w-auto"
            >
              <X className="size-4" /> Limpiar
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full table-fixed border-collapse">
            <thead className="border-b border-border text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
              <tr>
                <th className="w-[28%] px-[22px] py-2 text-left">Producto</th>
                <th className="w-[14%] px-3 py-2 text-left">Categoría</th>
                <th className="w-[12%] px-3 py-2 text-left">Marca</th>
                <th className="w-[18%] px-3 py-2 text-left">Variantes</th>
                <th className="w-[14%] px-3 py-2 text-right">Precio</th>
                <th className="w-[10%] px-3 py-2 text-right">Stock</th>
                <th className="w-[10%] px-3 py-2 text-right">Estado</th>
                <th className="w-12 px-[22px] py-2" />
              </tr>
            </thead>
            <tbody>
              {paginated.map((p) => (
                <tr key={p.id} className="tr-row border-b border-border">
                  <td className="px-[22px] py-3 align-top">
                    <Link href={`/productos/${p.id}`} className="flex min-w-0 items-center gap-2.5">
                      {p.product_image_url && !failedProductImages[p.id] ? (
                        <span className="flex size-8 flex-none items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.product_image_url}
                            alt={p.name}
                            className="h-full w-full object-cover"
                            onError={() =>
                              setFailedProductImages((current) => ({
                                ...current,
                                [p.id]: true,
                              }))
                            }
                          />
                        </span>
                      ) : (
                        <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-surface-2 text-[11px] font-bold text-text-2">
                          {initials(p.name)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block whitespace-normal break-words text-[12.5px] leading-snug font-medium text-foreground">
                          {p.name}
                        </span>
                        <span className="block text-[11px] text-text-3">
                          {p.variant_count} variantes
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-text-2">
                    <span className="block truncate">{p.category ?? "—"}</span>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-text-2">
                    <span className="block truncate">{p.brand ?? "—"}</span>
                  </td>
                  <td className="px-3 py-3">
                    <VariantSummary sizes={p.sizes} colors={p.colors} />
                  </td>
                  <td className="px-3 py-3 text-right text-[12.5px] font-medium text-foreground">
                    {p.min_price === p.max_price
                      ? fmtUSD(p.min_price)
                      : `${fmtUSD(p.min_price)}–${fmtUSD(p.max_price)}`}
                  </td>
                  <td className="px-3 py-3 text-right text-[12.5px] text-foreground">
                    {fmtNum(p.total_stock)}
                  </td>
                  <td className="px-3 py-3 text-right">
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
                  </td>
                  <td className="px-[22px] py-3">
                    <Link
                      href={`/productos/${p.id}`}
                      className="iconbtn flex size-7 items-center justify-center rounded-md text-text-3"
                      aria-label={`Abrir ${p.name}`}
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-[22px] py-10 text-center text-[13px] text-text-3">
                    No hay productos que coincidan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
          itemLabel="productos"
        />
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

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b),
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-[10px] border border-border bg-card px-3 text-[16px] text-foreground outline-none sm:h-[38px] sm:w-auto sm:text-[12.5px]"
    >
      <option value="">{placeholder}: todos</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function VariantSummary({
  sizes,
  colors,
}: {
  sizes: string[];
  colors: { name: string; hex: string | null }[];
}) {
  const shownSizes = sizes.slice(0, 3);
  const shownColors = colors.slice(0, 2);
  const hiddenCount =
    Math.max(0, sizes.length - shownSizes.length) +
    Math.max(0, colors.length - shownColors.length);

  if (!shownSizes.length && !shownColors.length) {
    return <span className="text-[12px] text-text-3">—</span>;
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {shownSizes.map((item) => (
        <span
          key={`size-${item}`}
          className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-text-2"
        >
          {item}
        </span>
      ))}
      {shownColors.map((item) => (
        <span
          key={`color-${item.name}`}
          className="inline-flex max-w-[96px] items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-text-2"
        >
          <span
            className="size-2 flex-none rounded-full border border-black/10"
            style={{ backgroundColor: item.hex ?? "#CBD5E1" }}
            aria-hidden="true"
          />
          <span className="truncate">{item.name}</span>
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-text-3">
          +{hiddenCount}
        </span>
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
      <DialogContent className="max-h-[90dvh] max-w-[520px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="is_active" value="true" />
          <input type="hidden" name="visible_in_catalog" value="true" />
          <input type="hidden" name="create_default_variant" value="true" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre del producto</Label>
            <Input id="name" name="name" placeholder="Ej. Scrub Set Cherokee Workwear" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
