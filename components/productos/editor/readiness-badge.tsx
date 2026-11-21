"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Missing, Readiness } from "@/lib/catalog/readiness";
import type { CatalogMasters } from "@/lib/queries/catalog";

export function missingLabel(
  missing: Missing,
  masters: CatalogMasters,
  colorsById: Map<string, string>,
  categoryId?: string | null,
): string {
  switch (missing.kind) {
    case "category": return "Falta la categoría";
    case "brand": return "Falta la marca";
    case "description": return "Falta la descripción";
    case "attribute": {
      const name = masters.attributes.find((attribute) => attribute.id === missing.attributeId)?.name ?? "característica";
      return `Falta ${name}`;
    }
    case "photo": return missing.colorId === null
      ? "Añadir al menos una foto"
      : `Añadir foto de ${colorsById.get(missing.colorId) ?? "un color"}`;
    case "price": return `Variante ${missing.sku} con precio 0`;
    case "variantColor": return `Variante ${missing.sku} sin color`;
    case "variantOption": {
      const optionTypeId = masters.categories.find((category) => category.id === categoryId)?.optionTypeId;
      const optionName = masters.optionTypes.find((option) => option.id === optionTypeId)?.name ?? "opción";
      return `Variante ${missing.sku} sin ${optionName}`;
    }
  }
}

function missingSection(missing: Missing): string {
  switch (missing.kind) {
    case "category":
    case "brand":
    case "attribute": return "#clasificacion";
    case "description": return "#informacion";
    case "photo": return "#galeria-producto";
    case "price":
    case "variantColor":
    case "variantOption": return "#variantes";
  }
}

export function ReadinessBadge({ readiness, masters, colorsById, categoryId }: {
  readiness: Readiness;
  masters: CatalogMasters;
  colorsById: Map<string, string>;
  categoryId?: string | null;
}) {
  const hasWarnings = readiness.warnings.length > 0;
  const readyWithWarnings = readiness.ready && hasWarnings;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={readyWithWarnings
            ? { background: "var(--surface-2)", color: "var(--text-2)" }
            : readiness.ready
              ? { background: "var(--success-soft)", color: "var(--success)" }
              : { background: "var(--warning-soft)", color: "var(--warning)" }}
          aria-label={readyWithWarnings
            ? `Listo para tienda; faltan fotos. ${readiness.warnings.length} fotos recomendadas. Ver detalle`
            : readiness.ready ? "Listo para tienda. Ver estado" : `Incompleto. ${readiness.missing.length} pendientes${hasWarnings ? ` y ${readiness.warnings.length} fotos recomendadas` : ""}. Ver detalle`}
        >
          {readyWithWarnings ? "Listo · faltan fotos" : readiness.ready ? "Listo para tienda" : `Incompleto (${readiness.missing.length})`}
          <ChevronDown className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-80 overflow-y-auto">
        <div className="mb-2 text-[12.5px] font-semibold text-foreground">
          {readiness.ready ? "El producto está listo para tienda" : "Pendiente para la tienda"}
        </div>
        {readiness.missing.length > 0 && (
          <ul className="flex flex-col gap-1.5 text-[12px]">
            {readiness.missing.map((missing, index) => (
              <li key={`${missing.kind}-${index}`}>
                <Link href={missingSection(missing)} className="text-text-2 underline-offset-2 hover:text-foreground hover:underline">
                  {missingLabel(missing, masters, colorsById, categoryId)}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {hasWarnings && (
          <section className={readiness.missing.length > 0 ? "mt-3 border-t border-border pt-2" : ""}>
            <div className="mb-1 text-[12px] font-semibold text-text-2">Recomendado</div>
            <ul className="flex flex-col gap-1.5 text-[12px]">
              {readiness.warnings.map((warning, index) => (
                <li key={`${warning.kind}-${index}`}>
                  <Link href={missingSection(warning)} className="text-text-2 underline-offset-2 hover:text-foreground hover:underline">
                    {missingLabel(warning, masters, colorsById, categoryId)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </PopoverContent>
    </Popover>
  );
}
