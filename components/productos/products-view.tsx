"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, ChevronRight, X, AlertTriangle, LayoutGrid } from "lucide-react";
import { TablePagination } from "@/components/ui/table-pagination";
import { fmtUSD, fmtNum, initials } from "@/lib/format";
import { matchesProductQuery } from "@/lib/search";
import { ProductsBulkBar } from "@/components/productos/bulk-bar";
import { NewProductDialog } from "@/components/productos/new-product-dialog";
import type { ProductListItem } from "@/lib/database.types";
import type { CatalogMasters } from "@/lib/queries/catalog";

type Ref = { id: string; name: string };

export function ProductsView({
  products,
  masters,
  categories,
  brands,
  sizes,
  colors,
  canEdit,
}: {
  products: ProductListItem[];
  masters: Pick<CatalogMasters, "departments" | "categories" | "brands">;
  categories: Ref[];
  brands: Ref[];
  sizes: { id: string; label: string }[];
  colors: { id: string; name: string; hex: string | null }[];
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [department, setDepartment] = useState("");
  const [brand, setBrand] = useState("");
  const [line, setLine] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [missingPhotosOnly, setMissingPhotosOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [failedProductImages, setFailedProductImages] = useState<Record<string, true>>({});

  const filterOptions = useMemo(
    () => ({
      sizes: uniqueSorted(products.flatMap((p) => p.sizes)),
      colors: uniqueSorted(products.flatMap((p) => p.colors.map((c) => c.name))),
    }),
    [products],
  );
  const incompleteCount = products.filter((p) => p.is_active && !p.ready).length;
  const missingPhotosCount = products.filter((p) => p.is_active && p.missing_photos).length;
  const hasFilters = Boolean(query.trim() || department || cat || brand || line || size || color || incompleteOnly || missingPhotosOnly);

  const filtered = useMemo(() => {
    let list = products;
    if (department) list = list.filter((p) => p.departmentId === department);
    if (cat) list = list.filter((p) => p.categoryId === cat);
    if (brand) list = list.filter((p) => p.brand_id === brand);
    if (line) list = list.filter((p) => p.lineId === line);
    if (incompleteOnly) list = list.filter((p) => p.is_active && !p.ready);
    if (missingPhotosOnly) list = list.filter((p) => p.is_active && p.missing_photos);
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
  }, [products, department, cat, brand, line, size, color, incompleteOnly, missingPhotosOnly, query]);

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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/productos/catalogo"
            className="hoverlift flex h-11 items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-[15px] text-[13px] font-semibold text-foreground sm:h-[38px]"
          >
            <LayoutGrid className="size-4" /> Ver catálogo
          </Link>
          {canEdit && (
            <>
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
            </>
          )}
        </div>
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
            value={department}
            onChange={(value) => {
              setDepartment(value);
              setCat("");
              setPage(1);
            }}
            placeholder="Departamento"
            options={masters.departments}
          />
          <FilterSelect
            value={cat}
            onChange={(value) => {
              setCat(value);
              setPage(1);
            }}
            placeholder="Categoría"
            options={masters.categories.filter((c) => !department || c.departmentId === department)}
          />
          <FilterSelect
            value={brand}
            onChange={(value) => {
              setBrand(value);
              setLine("");
              setPage(1);
            }}
            placeholder="Marca"
            options={masters.brands}
          />
          <FilterSelect
            value={line}
            onChange={(value) => {
              setLine(value);
              setPage(1);
            }}
            placeholder="Línea"
            options={masters.brands.filter((b) => !brand || b.id === brand).flatMap((b) => b.lines)}
          />
          <FilterSelect
            value={size}
            onChange={(value) => {
              setSize(value);
              setPage(1);
            }}
            placeholder="Talla / opción"
            options={filterOptions.sizes.map((name) => ({ id: name, name }))}
          />
          <FilterSelect
            value={color}
            onChange={(value) => {
              setColor(value);
              setPage(1);
            }}
            placeholder="Color"
            options={filterOptions.colors.map((name) => ({ id: name, name }))}
          />
          <button
            type="button"
            aria-pressed={incompleteOnly}
            onClick={() => { setIncompleteOnly((current) => !current); setPage(1); }}
            className={`h-11 rounded-[10px] border px-3 text-[12.5px] font-medium sm:h-[38px] ${incompleteOnly ? "border-warning bg-warning-soft text-warning" : "border-border bg-card text-text-2"}`}
          >
            Incompletos ({fmtNum(incompleteCount)})
          </button>
          <button
            type="button"
            aria-pressed={missingPhotosOnly}
            onClick={() => { setMissingPhotosOnly((current) => !current); setPage(1); }}
            className={`h-11 rounded-[10px] border px-3 text-[12.5px] font-medium sm:h-[38px] ${missingPhotosOnly ? "border-warning bg-warning-soft text-warning" : "border-border bg-card text-text-2"}`}
          >
            Faltan fotos ({fmtNum(missingPhotosCount)})
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setDepartment("");
                setCat("");
                setBrand("");
                setLine("");
                setSize("");
                setColor("");
                setIncompleteOnly(false);
                setMissingPhotosOnly(false);
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
                        {p.is_active && !p.ready && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-medium text-warning" title={`${p.missingCount} pendientes para tienda`}>
                            <AlertTriangle className="size-3" /> {p.missingCount} pendientes
                          </span>
                        )}
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
        <NewProductDialog
          open={open}
          onOpenChange={setOpen}
          masters={masters}
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
  options: { id: string; name: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-[10px] border border-border bg-card px-3 text-[16px] text-foreground outline-none sm:h-[38px] sm:w-auto sm:text-[12.5px]"
    >
      <option value="">{placeholder}: todos</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
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
