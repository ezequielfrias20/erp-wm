"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Concilia una orden Cashea: registra cuánto depositó Cashea (settled_amount),
 * la comisión retenida y la marca como cobrada. El filtro `.eq("status","pendiente")`
 * evita doble conciliación (una segunda llamada no afecta filas).
 */
export async function settleCasheaOrder(input: {
  id: string;
  settled_amount: number;
  commission_pct?: number;
  commission_amount?: number;
  notes?: string;
}): Promise<{ error?: string }> {
  if (!input.id) return { error: "Orden inválida." };
  if (!(input.settled_amount >= 0))
    return { error: "Ingresa el monto depositado por Cashea." };

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("cashea_orders")
    .select("financed_amount, status")
    .eq("id", input.id)
    .maybeSingle();
  if (!order) return { error: "Orden no encontrada." };
  if (order.status !== "pendiente") return { error: "Esta orden ya fue conciliada." };

  const financed = Number(order.financed_amount);
  const settled = round2(input.settled_amount);

  // Derivar comisión: se acepta % o monto; si falta uno se calcula del otro,
  // y si no se indica ninguno se infiere de la diferencia financiado − depositado.
  let commissionAmount = input.commission_amount;
  let commissionPct = input.commission_pct;
  if (commissionAmount == null && commissionPct != null) {
    commissionAmount = round2((financed * commissionPct) / 100);
  } else if (commissionAmount != null && commissionPct == null) {
    commissionPct = financed > 0 ? round2((commissionAmount / financed) * 100) : 0;
  } else if (commissionAmount == null && commissionPct == null) {
    commissionAmount = round2(Math.max(0, financed - settled));
    commissionPct = financed > 0 ? round2((commissionAmount / financed) * 100) : 0;
  }

  const { data, error } = await supabase
    .from("cashea_orders")
    .update({
      status: "cobrada",
      settled_at: new Date().toISOString(),
      settled_amount: settled,
      commission_amount: round2(commissionAmount ?? 0),
      commission_pct: round2(commissionPct ?? 0),
      net_amount: settled,
      notes: input.notes?.trim() || null,
    })
    .eq("id", input.id)
    .eq("status", "pendiente")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Esta orden ya fue conciliada." };

  revalidatePath("/cashea");
  revalidatePath("/reportes");
  revalidatePath("/dashboard");
  return {};
}

/** Anula manualmente una orden Cashea (deja de contar como por cobrar). */
export async function voidCasheaOrder(id: string): Promise<{ error?: string }> {
  if (!id) return { error: "Orden inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cashea_orders")
    .update({ status: "anulada" })
    .eq("id", id)
    .neq("status", "cobrada");
  if (error) return { error: error.message };

  revalidatePath("/cashea");
  revalidatePath("/reportes");
  revalidatePath("/dashboard");
  return {};
}
