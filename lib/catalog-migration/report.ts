/**
 * Reporte en Markdown de la preparación de la limpieza: primero lo que bloquea (para devolverlo
 * a la tienda) y, si no hay bloqueantes, qué hará el plan.
 */
import type { CleanupPlan } from "./cleanup-plan";
import type { Proposal } from "./propose";
import type { Blocker, Drift } from "./validate";

const KIND: Record<Blocker["kind"], string> = {
  edit: "Error en el Excel",
  product: "Producto incompleto",
  variant: "Variante incompleta",
  merge: "Fusión inválida",
  duplicate: "Variantes repetidas",
};

const list = (items: string[]) => (items.length ? items.map((x) => `- ${x}`).join("\n") : "Ninguno.");

export function renderReport(input: {
  plan: CleanupPlan | null;
  blockers: Blocker[];
  drift: Drift;
  before: Proposal["stats"];
}): string {
  const { plan, blockers, drift, before } = input;
  const out: string[] = ["# Limpieza del catálogo — reporte", ""];

  if (blockers.length) {
    out.push(
      `## Bloqueantes (${blockers.length})`,
      "",
      "No se genera el plan hasta resolver esto (devolver a la tienda lo que corresponda).",
      "",
      list(blockers.map((b) => `**${KIND[b.kind]}** · ${b.ref}: ${b.message}`)),
      "",
    );
  }

  const driftLines = [
    ...drift.newProducts.map((x) => `Producto nuevo: ${x.name}`),
    ...drift.changedProducts.map((x) => `Producto editado: ${x.name}`),
    ...drift.removedProducts.map((x) => `Producto borrado: ${x.name}`),
    ...drift.newVariants.map((x) => `Variante nueva: ${x.sku}`),
    ...drift.changedVariants.map((x) => `Variante editada: ${x.sku}`),
    ...drift.removedVariants.map((x) => `Variante borrada: ${x.sku}`),
  ];
  out.push(
    "## Cambios posteriores a la foto",
    "",
    "Lo creado o editado después de la foto de la revisión recibe la propuesta automática.",
    "",
    list(driftLines),
    "",
  );

  if (!plan) return out.join("\n");

  const skuById = new Map(plan.variants.map((v) => [v.id, v.sku]));
  const merged = plan.variants.filter((v) => v.mergeIntoId);
  const joined = plan.products.filter((p) => p.mergeIds.length);
  const removedProducts = joined.reduce((n, p) => n + p.mergeIds.length, 0);
  const withColor = plan.media.filter((m) => m.color).length;

  out.push(
    "## Resumen",
    "",
    `- Productos: ${before.productsBefore} → ${plan.products.length} (${plan.products.filter((p) => p.isActive).length} activos; ${removedProducts} se unen en otros)`,
    `- Variantes que se fusionan: ${merged.length} (sus SKU quedan como alias)`,
    `- Departamentos: ${plan.departments.length} · categorías: ${plan.categories.length} · categorías viejas a borrar: ${plan.legacyCategoryIds.length}`,
    `- Marcas: ${plan.brands.length} (${plan.brands.filter((b) => !b.reuseId).length} nuevas) · líneas: ${plan.lines.length}`,
    `- Colores: ${plan.colors.length} (${plan.colors.filter((c) => !c.reuseId).length} nuevos) · colores viejos a borrar: ${plan.legacyColorIds.length}`,
    `- Fotos: ${plan.media.length}`,
    `- Guarda: ${plan.guard.products} productos, ${plan.guard.variants} variantes, última edición ${plan.guard.maxUpdatedAt}`,
    "",
    "## Productos que se unen",
    "",
    list(joined.map((p) => `${p.name} ← ${p.mergeIds.length + 1} productos`)),
    "",
    "## Variantes que se fusionan",
    "",
    list(merged.map((v) => `${v.sku} → ${skuById.get(v.mergeIntoId!)}`)),
    "",
    "## Fotos",
    "",
    `${plan.media.length} fotos: ${withColor} asignadas a un color y ${plan.media.length - withColor} generales.`,
    "",
  );
  return out.join("\n");
}
