import type { DailyClosureLine } from "@/lib/database.types";

// Un cierre reúne dinero que cae en cuentas distintas. Sólo la caja de la
// sucursal suma al total de caja; Cashea Online y el depósito de Cashea se
// confirman y totalizan cada uno por su lado.
export type ClosureGroupKey = "caja" | "cashea_online" | "cashea_deposito";

const GROUPS: { key: ClosureGroupKey; title: string; note: string | null }[] = [
  { key: "caja", title: "Caja de la sucursal", note: null },
  {
    key: "cashea_online",
    title: "Cashea Online",
    note: "Iniciales de ventas Cashea Online. Van a otra cuenta y no suman a la caja.",
  },
  {
    key: "cashea_deposito",
    title: "Depósito Cashea",
    note: "Depósito conciliado de Cashea. Es otra cuenta y no suma a la caja.",
  },
];

export function closureGroupOf(row: Pick<DailyClosureLine, "source" | "method">): ClosureGroupKey {
  if (row.source === "cashea_settlement") return "cashea_deposito";
  if (row.source === "cashea_online") return "cashea_online";
  // Cierres guardados antes de que existiera el origen `cashea_online`: la
  // inicial por Pago Móvil venía como venta, con el nombre «Cashea Online (…)».
  if (row.source === "sale" && row.method.startsWith("Cashea Online")) return "cashea_online";
  return "caja";
}

export type ClosureTotal = { currency: "USD" | "VES"; expected: number; counted: number };

export type ClosureGroup<Row> = {
  key: ClosureGroupKey;
  title: string;
  note: string | null;
  rows: Row[];
  totals: ClosureTotal[];
};

// `counted` lee el monto confirmado de cada renglón: en la vista previa sale de
// lo que escribe el cajero; en un cierre guardado, del snapshot.
export function groupClosureRows<Row extends DailyClosureLine>(
  rows: Row[],
  counted: (row: Row) => number = (row) => Number(row.counted ?? 0),
): ClosureGroup<Row>[] {
  return GROUPS.map((group) => {
    const groupRows = rows.filter((row) => closureGroupOf(row) === group.key);
    const totals = (["USD", "VES"] as const)
      .map((currency) => {
        const lines = groupRows.filter((row) => row.currency === currency);
        if (!lines.length) return null;
        return {
          currency,
          expected: lines.reduce((sum, row) => sum + Number(row.expected), 0),
          counted: lines.reduce((sum, row) => sum + counted(row), 0),
        };
      })
      .filter((total): total is ClosureTotal => total !== null);
    return { ...group, rows: groupRows, totals };
  }).filter((group) => group.rows.length > 0);
}
