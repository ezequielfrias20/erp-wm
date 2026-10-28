"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/queries/session";
import { getProfileBranchScope } from "@/lib/branch";
import { canEdit } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { parseReportDate, reportYmdFromDate } from "@/lib/report-dates";
import type { DailyClosure } from "@/lib/database.types";

export type CountedLine = {
  source: "sale" | "legacy" | "cashea_settlement";
  method: string;
  currency: "USD" | "VES";
  amount: number;
};

export async function saveDailyClosure(input: {
  branchId: string;
  date: string;
  counted: CountedLine[];
  notes: string;
}): Promise<{ closure?: DailyClosure; error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." };
  if (!canEdit(session.permissions, "Ventas")) {
    return { error: "No tienes permiso para guardar cierres." };
  }
  const assignedBranchId = getProfileBranchScope(session.profile);
  if (assignedBranchId && assignedBranchId !== input.branchId) {
    return { error: "No puedes cerrar otra sucursal." };
  }
  if (!parseReportDate(input.date) || input.date > reportYmdFromDate()) {
    return { error: "La fecha de cierre no es válida." };
  }
  if (!Array.isArray(input.counted) || !input.counted.length) {
    return { error: "Confirma los montos de cada método." };
  }
  if (input.counted.some((line) =>
    !Number.isFinite(line.amount) || line.amount < 0 ||
    Math.abs(Math.round(line.amount * 100) - line.amount * 100) > 0.000001
  )) {
    return { error: "Los montos deben ser positivos y tener máximo dos decimales." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_daily", {
    p_branch_id: input.branchId,
    p_date: input.date,
    p_counted: input.counted,
    p_notes: input.notes,
  });
  if (error) return { error: error.message };
  if (!data) return { error: "No se recibió el cierre guardado." };
  revalidatePath("/cierres");
  return { closure: data };
}
