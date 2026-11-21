"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ImageOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { missingLabel } from "@/components/productos/editor/readiness-badge";
import { filterCatalogProducts } from "@/lib/catalog/browse";
import { fmtNum, fmtUSD } from "@/lib/format";
import type { CatalogBrowseData, CatalogBrowseProduct } from "@/lib/queries/catalog-browse";

function Price({ product }: { product: CatalogBrowseProduct }) {
  if (product.priceMin === null) return <span>Sin precio</span>;
  return <span>{fmtUSD(product.priceMin)}{product.priceMax !== product.priceMin ? ` – ${fmtUSD(product.priceMax)}` : ""}</span>;
}

function Photo({ url, name, className }: { url: string | null; name: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <div className={`${className} flex items-center justify-center gap-2 bg-surface-2 text-sm text-text-3`}><ImageOff className="size-5" /> Sin foto</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} loading="lazy" className={`${className} object-contain bg-white`} onError={() => setFailed(true)} />
  );
}

function Readiness({ product }: { product: CatalogBrowseProduct }) {
  const readyWithWarnings = product.ready && product.warnings.length > 0;
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${readyWithWarnings ? "bg-surface-2 text-text-2" : product.ready ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
    {readyWithWarnings ? "Listo · faltan fotos" : product.ready ? "Listo" : `Incompleto (${product.missing.length})`}
  </span>;
}

function ColorDot({ hex, name }: { hex: string | null; name: string }) {
  return <span title={name} aria-label={name} className="inline-block size-4 shrink-0 rounded-full border border-black/20 bg-surface-2" style={hex ? { backgroundColor: hex } : undefined} />;
}

function ProductDetail({ product, data, onClose }: { product: CatalogBrowseProduct; data: CatalogBrowseData; onClose: () => void }) {
  const [selectedColorId, setSelectedColorId] = useState<string | null>(product.generalPhotos.length ? null : product.colors.find((color) => color.photos.length)?.id ?? product.colors[0]?.id ?? null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const selectedColor = product.colors.find((color) => color.id === selectedColorId);
  const gallery = selectedColor ? selectedColor.photos : product.generalPhotos;
  const options = selectedColor ? selectedColor.options : product.uncoloredOptions;
  const colorNames = new Map(product.colors.map((color) => [color.id, color.name]));
  const hasUncolored = product.hasUncoloredVariants;

  function chooseColor(id: string | null) {
    setSelectedColorId(id);
    setPhotoIndex(0);
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[1100px] overflow-y-auto p-4 sm:p-6">
      <DialogHeader className="pr-8 text-left">
        <DialogTitle className="text-xl leading-snug">{product.name}</DialogTitle>
        <DialogDescription>{[product.brand, product.line].filter(Boolean).join(" · ") || "Sin marca"}</DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Photo key={gallery[photoIndex] ?? `empty-${selectedColorId}`} url={gallery[photoIndex] ?? null} name={product.name} className="aspect-square w-full rounded-xl border border-border" />
          {gallery.length > 1 && <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1">
            {gallery.map((url, index) => <button key={`${url}-${index}`} type="button" onClick={() => setPhotoIndex(index)} aria-label={`Ver foto ${index + 1}`} aria-pressed={photoIndex === index} className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 ${photoIndex === index ? "border-brand" : "border-border"}`}>
              <Photo url={url} name={`${product.name}, foto ${index + 1}`} className="size-full" />
            </button>)}
          </div>}
        </div>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xl font-bold"><Price product={product} /></p><Readiness product={product} /></div>
          {(product.generalPhotos.length > 0 || hasUncolored || product.colors.length > 0) && <section>
            <h3 className="mb-2 text-sm font-semibold">Colores y opciones</h3>
            <div className="flex flex-wrap gap-2">
              {(product.generalPhotos.length > 0 || hasUncolored) && <button type="button" onClick={() => chooseColor(null)} aria-pressed={selectedColorId === null} className={`min-h-9 rounded-lg border px-3 text-sm ${selectedColorId === null ? "border-brand bg-brand-soft text-brand" : "border-border"}`}>
                {product.generalPhotos.length ? "General" : "Sin color"}
              </button>}
              {product.colors.map((color) => <button key={color.id} type="button" onClick={() => chooseColor(color.id)} aria-pressed={selectedColorId === color.id} className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm ${selectedColorId === color.id ? "border-brand bg-brand-soft text-brand" : "border-border"}`}>
                <ColorDot name={color.name} hex={color.hex} /> {color.name}
              </button>)}
            </div>
            {options.length > 0 && <p className="mt-2 text-sm text-text-2">Opciones: {options.join(" · ")}</p>}
            {selectedColorId === null && product.generalPhotos.length > 0 && hasUncolored && <p className="mt-1 text-sm text-text-2">Opciones sin color: {product.uncoloredOptions.join(" · ")}</p>}
          </section>}
          <section><h3 className="mb-2 text-sm font-semibold">Descripción</h3><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-2">{product.description || "Sin descripción"}</p></section>
          {product.specs.length > 0 && <section><h3 className="mb-2 text-sm font-semibold">Ficha técnica</h3><dl className="divide-y divide-border rounded-lg border border-border text-sm">{product.specs.map((spec, index) => <div key={`${spec.label}-${index}`} className="grid gap-1 p-2.5 sm:grid-cols-2"><dt className="font-medium break-words">{spec.label}</dt><dd className="break-words text-text-2">{spec.value}</dd></div>)}</dl></section>}
          {product.attributes.length > 0 && <section><h3 className="mb-2 text-sm font-semibold">Características</h3><dl className="space-y-1 text-sm">{product.attributes.map((attribute) => <div key={attribute.name} className="grid gap-1 sm:grid-cols-2"><dt className="font-medium">{attribute.name}</dt><dd className="text-text-2">{attribute.values.join(" · ")}</dd></div>)}</dl></section>}
          {product.missing.length > 0 && <section className="rounded-lg bg-warning-soft p-3"><h3 className="mb-2 text-sm font-semibold text-warning">Qué le falta para la tienda</h3><ul className="list-inside list-disc space-y-1 text-sm text-warning">{product.missing.map((item, index) => <li key={`${item.kind}-${index}`}>{missingLabel(item, data.masters, colorNames, product.categoryId)}</li>)}</ul></section>}
          {product.warnings.length > 0 && <section className="rounded-lg bg-surface-2 p-3"><h3 className="mb-2 text-sm font-semibold text-text-2">Recomendado</h3><ul className="list-inside list-disc space-y-1 text-sm text-text-2">{product.warnings.map((item, index) => <li key={`${item.kind}-${index}`}>{missingLabel(item, data.masters, colorNames, product.categoryId)}</li>)}</ul></section>}
          <Button variant="outline" asChild><Link href={`/productos/${product.id}`}>Editar producto</Link></Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

export function CatalogBrowser({ data }: { data: CatalogBrowseData }) {
  const [query, setQuery] = useState("");
  const [brandId, setBrandId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = useMemo(() => filterCatalogProducts(data.products, { query, brandId, departmentId, categoryId, uncategorizedOnly, unassignedOnly, readyOnly }), [data.products, query, brandId, departmentId, categoryId, uncategorizedOnly, unassignedOnly, readyOnly]);
  const selected = data.products.find((product) => product.id === selectedId);

  return <div className="mx-auto max-w-[1560px] min-w-0 px-4 pt-4 pb-10 sm:px-5 sm:pt-5 lg:px-[30px] lg:pt-[26px]">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-[25px] font-bold tracking-tight">Catálogo</h1><p className="mt-1 text-[13px] text-text-2">{fmtNum(filtered.length)} de {fmtNum(data.products.length)} productos activos</p></div>
      <Button variant="outline" asChild><Link href="/productos"><ArrowLeft className="size-4" /> Productos</Link></Button>
    </header>
    <div className="grid min-w-0 gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="min-w-0 self-start rounded-2xl border border-border bg-card p-3 shadow-card-sm">
        <h2 className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-text-3">Categorías</h2>
        <button type="button" onClick={() => { setDepartmentId(""); setCategoryId(""); setUncategorizedOnly(false); setUnassignedOnly(false); }} aria-current={!departmentId && !categoryId && !unassignedOnly ? "page" : undefined} className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm ${!departmentId && !categoryId && !unassignedOnly ? "bg-brand-soft font-semibold text-brand" : "hover:bg-surface-2"}`}><span>Todo</span><span>{fmtNum(data.products.length)}</span></button>
        <div className="max-h-72 overflow-y-auto lg:max-h-[calc(100vh-15rem)]">{data.departments.map((department) => {
          return <div key={department.id} className="mt-1">
            <button type="button" onClick={() => { setDepartmentId(department.id); setCategoryId(""); setUncategorizedOnly(false); setUnassignedOnly(false); }} aria-current={departmentId === department.id && !categoryId && !uncategorizedOnly ? "page" : undefined} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold ${departmentId === department.id && !categoryId && !uncategorizedOnly ? "bg-brand-soft text-brand" : "hover:bg-surface-2"}`}><span className="min-w-0 break-words">{department.name}</span><span>{fmtNum(department.productCount)}</span></button>
            {department.categories.map((category) => <button key={category.id} type="button" onClick={() => { setDepartmentId(department.id); setCategoryId(category.id); setUncategorizedOnly(false); setUnassignedOnly(false); }} aria-current={categoryId === category.id ? "page" : undefined} className={`flex w-full items-center justify-between gap-2 rounded-lg py-2 pr-2 pl-5 text-left text-sm ${categoryId === category.id ? "bg-brand-soft font-semibold text-brand" : "text-text-2 hover:bg-surface-2"}`}><span className="min-w-0 break-words">{category.name}</span><span>{fmtNum(category.productCount)}</span></button>)}
            {department.uncategorizedCount > 0 && <button type="button" onClick={() => { setDepartmentId(department.id); setCategoryId(""); setUncategorizedOnly(true); setUnassignedOnly(false); }} aria-current={departmentId === department.id && uncategorizedOnly ? "page" : undefined} className={`flex w-full items-center justify-between gap-2 rounded-lg py-2 pr-2 pl-5 text-left text-sm ${departmentId === department.id && uncategorizedOnly ? "bg-brand-soft font-semibold text-brand" : "text-text-2 hover:bg-surface-2"}`}><span className="min-w-0 break-words">Sin categoría</span><span>{fmtNum(department.uncategorizedCount)}</span></button>}
          </div>;
        })}{data.unassignedCount > 0 && <button type="button" onClick={() => { setDepartmentId(""); setCategoryId(""); setUncategorizedOnly(false); setUnassignedOnly(true); }} aria-current={unassignedOnly ? "page" : undefined} className={`mt-1 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold ${unassignedOnly ? "bg-brand-soft text-brand" : "hover:bg-surface-2"}`}><span>Sin departamento</span><span>{fmtNum(data.unassignedCount)}</span></button>}</div>
      </aside>
      <main className="min-w-0">
        <div className="mb-4 flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-card-sm sm:flex-row sm:flex-wrap sm:items-center">
          <label className="relative min-w-0 flex-1 sm:min-w-[220px]"><span className="sr-only">Buscar por nombre o marca</span><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o marca…" className="h-10 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm" /></label>
          <Select value={brandId || "__all__"} onValueChange={(value) => setBrandId(value === "__all__" ? "" : value)}><SelectTrigger className="h-10 w-full sm:w-44" aria-label="Filtrar por marca"><SelectValue placeholder="Todas las marcas" /></SelectTrigger><SelectContent><SelectItem value="__all__">Todas las marcas</SelectItem>{data.brands.map((brand) => <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}</SelectContent></Select>
          <label className="flex items-center gap-2 text-sm"><Switch checked={readyOnly} onCheckedChange={setReadyOnly} /><span>Sólo listos para tienda</span></label>
        </div>
        {filtered.length === 0 ? <div className="rounded-2xl border border-border bg-card px-4 py-12 text-center text-sm text-text-2">No hay productos con estos filtros.</div> : <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((product) => <button key={product.id} type="button" onClick={() => setSelectedId(product.id)} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-left shadow-card-sm transition hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <Photo url={product.mainPhotoUrl} name={product.name} className="aspect-[4/3] w-full border-b border-border" />
            <div className="space-y-2 p-3"><h2 className="min-h-10 break-words text-sm font-semibold leading-snug">{product.name}</h2><p className="truncate text-xs text-text-2">{[product.brand, product.line].filter(Boolean).join(" · ") || "Sin marca"}</p><p className="text-sm font-semibold"><Price product={product} /></p><div className="flex min-h-5 items-center gap-1">{product.colors.slice(0, 8).map((color) => <ColorDot key={color.id} name={color.name} hex={color.hex} />)}{product.colors.length > 8 && <span className="text-xs text-text-2">+{product.colors.length - 8}</span>}</div><Readiness product={product} /></div>
          </button>)}
        </div>}
      </main>
    </div>
    {selected && <ProductDetail key={selected.id} product={selected} data={data} onClose={() => setSelectedId(null)} />}
  </div>;
}
