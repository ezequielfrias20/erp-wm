/**
 * Prepara la limpieza del catálogo: foto actual + Excel devueltos → reporte y plan JSON.
 *
 *   npm run catalogo:limpieza -- --snapshot <foto nueva> --base <foto de la revisión> \
 *     --revisado <xlsx> [--revisado <xlsx> …]
 *
 * Escribe backups/catalogo/reporte-<UTC>.md y, si no hay bloqueantes, plan-<UTC>.json.
 * Sale con 1 si hay bloqueantes. No toca la base: aplicar es scripts/catalogo/aplicar.sh.
 * Ver docs/CATALOGO-LIMPIEZA.md.
 */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { applyEdits } from "@/lib/catalog-migration/apply-edits";
import { buildCleanupPlan } from "@/lib/catalog-migration/cleanup-plan";
import { buildProposal } from "@/lib/catalog-migration/propose";
import { readReviewWorkbook } from "@/lib/catalog-migration/read-review";
import { renderReport } from "@/lib/catalog-migration/report";
import { loadSnapshot } from "@/lib/catalog-migration/snapshot";
import { TAXONOMY } from "@/lib/catalog-migration/taxonomy";
import { detectDrift, validateForApply } from "@/lib/catalog-migration/validate";

async function main() {
  const { values } = parseArgs({
    options: {
      snapshot: { type: "string" },
      base: { type: "string" },
      revisado: { type: "string", multiple: true },
    },
  });
  if (!values.snapshot || !values.base || !values.revisado?.length) {
    console.error(
      "Uso: npm run catalogo:limpieza -- --snapshot <foto nueva> --base <foto de la revisión> --revisado <xlsx> [--revisado <xlsx> …]",
    );
    process.exit(1);
  }

  const current = await loadSnapshot(values.snapshot);
  const review = await loadSnapshot(values.base);
  const edits = await Promise.all(values.revisado.map((f) => readReviewWorkbook(f, TAXONOMY)));
  const proposal = buildProposal(current, TAXONOMY);
  const { proposal: final, tax, issues } = applyEdits(proposal, TAXONOMY, edits);
  const blockers = validateForApply(final, tax, issues);
  const drift = detectDrift(review, current);
  const plan = blockers.length ? null : buildCleanupPlan(current, final, tax, randomUUID());

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const reportPath = `backups/catalogo/reporte-${stamp}.md`;
  await writeFile(reportPath, renderReport({ plan, blockers, drift, before: proposal.stats }));
  console.log(`Reporte: ${reportPath}`);

  const driftCount = Object.values(drift).reduce((n, list) => n + list.length, 0);
  console.log(`Cambios posteriores a la foto: ${driftCount}`);
  if (!plan) {
    console.log(`Bloqueantes: ${blockers.length}`);
    for (const b of blockers) console.log(`  [${b.kind}] ${b.ref}: ${b.message}`);
    process.exit(1);
  }
  const planPath = `backups/catalogo/plan-${stamp}.json`;
  await writeFile(planPath, JSON.stringify(plan));
  console.log(`Sin bloqueantes. Plan: ${planPath}`);
  console.log(`Simular: scripts/catalogo/aplicar.sh ${planPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
