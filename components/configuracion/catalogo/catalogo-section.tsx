"use client";

import { useState } from "react";
import type { CatalogAdminData } from "@/lib/catalog/admin-types";
import { CategoriesCard } from "./categories-card";
import { BrandsCard } from "./brands-card";
import { ColorsCard } from "./colors-card";
import { OptionsCard } from "./options-card";
import { AttributesCard } from "./attributes-card";

const tabs = ["Categorías", "Marcas y líneas", "Colores", "Tallas y opciones", "Características"] as const;

export function CatalogoSection({ data, canEdit }: { data: CatalogAdminData; canEdit: boolean }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Categorías");
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-1" role="tablist" aria-label="Maestros del catálogo">
      {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${tab === item ? "bg-card text-foreground shadow-sm" : "text-text-2 hover:text-foreground"}`}>{item}</button>)}
    </div>
    {tab === "Categorías" && <CategoriesCard data={data} canEdit={canEdit} />}
    {tab === "Marcas y líneas" && <BrandsCard data={data} canEdit={canEdit} />}
    {tab === "Colores" && <ColorsCard data={data} canEdit={canEdit} />}
    {tab === "Tallas y opciones" && <OptionsCard data={data} canEdit={canEdit} />}
    {tab === "Características" && <AttributesCard data={data} canEdit={canEdit} />}
  </div>;
}
