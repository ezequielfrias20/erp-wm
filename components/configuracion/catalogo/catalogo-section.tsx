"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadCatalogAdminData } from "@/app/(app)/configuracion/catalog-actions";
import { Button } from "@/components/ui/button";
import type { CatalogAdminData } from "@/lib/catalog/admin-types";
import { CatalogReloadContext } from "./master-ui";
import { CategoriesCard } from "./categories-card";
import { BrandsCard } from "./brands-card";
import { ColorsCard } from "./colors-card";
import { OptionsCard } from "./options-card";
import { AttributesCard } from "./attributes-card";

const tabs = ["Categorías", "Marcas y líneas", "Colores", "Tallas y opciones", "Características"] as const;

export function CatalogoSection({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Categorías");
  const [data, setData] = useState<CatalogAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const reload = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const result = await loadCatalogAdminData();
      if (current !== requestId.current) return;
      if (!result.data) {
        setError(result.error ?? "No se pudo cargar el catálogo.");
      } else {
        setData(result.data);
        setError(null);
      }
    } catch {
      if (current === requestId.current) setError("No se pudo cargar el catálogo.");
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const current = ++requestId.current;
    void loadCatalogAdminData().then((result) => {
      if (cancelled || current !== requestId.current) return;
      if (result.data) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error ?? "No se pudo cargar el catálogo.");
      }
    }).catch(() => {
      if (!cancelled && current === requestId.current) setError("No se pudo cargar el catálogo.");
    }).finally(() => {
      if (!cancelled && current === requestId.current) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);
  return <CatalogReloadContext.Provider value={reload}><div className="min-w-0 space-y-4">
    <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-1" role="tablist" aria-label="Maestros del catálogo">
      {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${tab === item ? "bg-card text-foreground shadow-sm" : "text-text-2 hover:text-foreground"}`}>{item}</button>)}
    </div>
    {loading && !data && <div className="rounded-2xl border border-border bg-card p-5 text-[13px] text-text-2" role="status">Cargando catálogo…</div>}
    {error && <div className="rounded-2xl border border-border bg-card p-5"><p className="mb-3 text-[13px] text-danger">{error}</p><Button type="button" variant="outline" onClick={() => void reload()} disabled={loading}>Reintentar</Button></div>}
    {data && !error && <>
      {loading && <p className="text-[12px] text-text-3" role="status">Actualizando catálogo…</p>}
      {tab === "Categorías" && <CategoriesCard data={data} canEdit={canEdit} />}
      {tab === "Marcas y líneas" && <BrandsCard data={data} canEdit={canEdit} />}
      {tab === "Colores" && <ColorsCard data={data} canEdit={canEdit} />}
      {tab === "Tallas y opciones" && <OptionsCard data={data} canEdit={canEdit} />}
      {tab === "Características" && <AttributesCard data={data} canEdit={canEdit} />}
    </>}
  </div></CatalogReloadContext.Provider>;
}
