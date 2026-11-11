/**
 * Genera el Excel de revisión del catálogo a partir de una foto de producción.
 *
 *   npm run catalogo:excel -- --snapshot backups/catalogo/snapshot-<UTC>.json [--out <xlsx>]
 *
 * Ver docs/CATALOGO-LIMPIEZA.md.
 */
import { format } from "date-fns";
import { parseArgs } from "node:util";
import { buildProposal } from "@/lib/catalog-migration/propose";
import { loadSnapshot } from "@/lib/catalog-migration/snapshot";
import { TAXONOMY } from "@/lib/catalog-migration/taxonomy";
import { buildReviewWorkbook } from "@/lib/catalog-migration/workbook";

async function main() {
  const { values } = parseArgs({
    options: { snapshot: { type: "string" }, out: { type: "string" } },
  });
  if (!values.snapshot) {
    console.error("Uso: npm run catalogo:excel -- --snapshot <foto.json> [--out <archivo.xlsx>]");
    process.exit(1);
  }
  const out = values.out ?? `backups/catalogo/revision-catalogo-${format(new Date(), "yyyy-MM-dd")}.xlsx`;

  const snapshot = await loadSnapshot(values.snapshot);
  const proposal = buildProposal(snapshot, TAXONOMY);
  const wb = buildReviewWorkbook(proposal, TAXONOMY, { generatedAt: new Date().toISOString() });
  await wb.xlsx.writeFile(out);

  const s = proposal.stats;
  console.log("── Resumen de la propuesta");
  console.log(`Productos: ${s.productsBefore} → ${s.productsAfter} (${s.mergedGroups} grupos unidos)`);
  console.log(`Variantes repetidas a fusionar: ${s.duplicateVariants}`);
  console.log(`Productos sin categoría: ${s.missingCategory}`);
  console.log(`Productos sin marca: ${s.missingBrand}`);
  console.log(`Productos activos con atributos obligatorios vacíos: ${s.missingRequiredAttributes}`);

  const countNotes = (prefix: string) => {
    const counts = new Map<string, number>();
    for (const v of proposal.variants) {
      for (const n of v.notes) if (n.startsWith(prefix)) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  };
  console.log(`\n── Colores sin equivalencia (${proposal.unresolved.colors.length})`);
  for (const [n, c] of countNotes("Color «")) console.log(`  ${n}: ${c}`);
  console.log(`\n── Textos de talla sin reconocer (${proposal.unresolved.sizes.length}) — quedan como nota para la tienda`);
  for (const [n, c] of countNotes("Revisar: «")) console.log(`  ${n}: ${c}`);

  console.log("\n── Grupos con más productos unidos");
  for (const prod of [...proposal.products].sort((a, b) => b.sourceProductIds.length - a.sourceProductIds.length).slice(0, 10)) {
    console.log(`  ${prod.name} ← ${prod.sourceProductIds.length} productos`);
  }
  console.log(`\nExcel: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
