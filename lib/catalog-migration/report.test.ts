import { describe, expect, it } from "vitest";
import { buildCleanupPlan } from "./cleanup-plan";
import { isIncomplete } from "./completeness";
import { buildProposal } from "./propose";
import { renderReport } from "./report";
import { TAXONOMY } from "./taxonomy";
import { MINI_SNAPSHOT } from "./test-fixtures";
import { detectDrift, type Blocker } from "./validate";

const proposal = buildProposal(MINI_SNAPSHOT, TAXONOMY);
const noDrift = detectDrift(MINI_SNAPSHOT, MINI_SNAPSHOT);

describe("renderReport", () => {
  it("con bloqueantes: la primera sección los lista con su referencia", () => {
    const blockers: Blocker[] = [
      { kind: "variant", ref: "GOR-GORRO-0001", message: "Falta Amarre (Gorro Unicolor)" },
      { kind: "product", ref: "Skechers", message: "Falta Género" },
    ];
    const md = renderReport({ plan: null, blockers, drift: noDrift, before: proposal.stats });
    const sections = md.split("\n").filter((l) => l.startsWith("## "));
    expect(sections[0]).toBe("## Bloqueantes (2)");
    expect(md).toContain("GOR-GORRO-0001");
    expect(md).toContain("Falta Amarre (Gorro Unicolor)");
    expect(md).toContain("Skechers");
    expect(md).not.toContain("## Productos que se unen");
  });

  it("sin bloqueantes: resumen, cambios, uniones, fusiones y fotos", () => {
    const p = structuredClone(proposal);
    for (const prod of p.products) if (isIncomplete(prod, TAXONOMY)) prod.active = false;
    const s = structuredClone(MINI_SNAPSHOT);
    s.products.find((x) => x.id === "p2")!.has_image = true;
    const plan = buildCleanupPlan(s, p, TAXONOMY, "run-1");
    const md = renderReport({ plan, blockers: [], drift: noDrift, before: proposal.stats });
    for (const h of ["## Resumen", "## Cambios posteriores a la foto", "## Productos que se unen", "## Variantes que se fusionan", "## Fotos"]) {
      expect(md).toContain(h);
    }
    expect(md).toMatch(/Productos: 15 → \d+/);
    expect(md).toContain("Figs Dama ← 2 productos");
    expect(md).toContain("UNI-MAOSTR-0018 → UNI-MAOSTR-0017");
    expect(md).toContain("Ninguno");
  });

  it("lista los cambios posteriores a la foto", () => {
    const md = renderReport({
      plan: null,
      blockers: [],
      drift: { ...noDrift, newVariants: [{ id: "v1", sku: "NUEVO-1" }], changedProducts: [{ id: "p1", name: "Mao" }] },
      before: proposal.stats,
    });
    expect(md).toContain("NUEVO-1");
    expect(md).toContain("Mao");
  });
});
