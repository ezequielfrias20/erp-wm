"use server";

import { revalidatePath } from "next/cache";
import { getProfileBranchScope } from "@/lib/branch";
import { branchScopeError, isUuid } from "@/lib/online-orders/rules";
import { canEdit } from "@/lib/permissions";
import { getSession } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";

async function authorize() {
  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." } as const;
  if (!canEdit(session.permissions, "Ventas")) {
    return { error: "No autorizado para gestionar pedidos online." } as const;
  }
  return { session } as const;
}

async function checkBranchScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  assignedBranch: string | null,
  requestedBranchIds: string[],
): Promise<string | null> {
  if (assignedBranch === null) return null;
  const { data, error } = await supabase.from("online_order_items")
    .select("branch_id").eq("order_id", orderId).eq("branch_id", assignedBranch).limit(1);
  if (error) throw new Error(error.message);
  return branchScopeError(assignedBranch, (data ?? []).map((item) => item.branch_id), requestedBranchIds);
}

function reasonError(reason: unknown): string | null {
  if (reason !== null && (typeof reason !== "string" || reason.length > 500)) {
    return "El motivo debe ser un texto de máximo 500 caracteres";
  }
  return null;
}

function revalidateOrder(orderId: string) {
  revalidatePath("/pedidos-online");
  revalidatePath(`/pedidos-online/${orderId}`);
}

export async function acceptOnlineOrder(
  orderId: string,
  lines: { itemId: string; branchId: string; quantity: number }[],
): Promise<{ error?: string }> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(orderId)) return { error: "El pedido no es válido" };
  if (!Array.isArray(lines) || !lines.every((line) =>
    line !== null && typeof line === "object" && isUuid(line.itemId)
    && isUuid(line.branchId) && Number.isInteger(line.quantity) && line.quantity >= 0
  )) {
    return { error: "Cada línea debe tener un producto, una sucursal y una cantidad entera no negativa" };
  }
  const supabase = await createClient();
  const scopeError = await checkBranchScope(
    supabase, orderId, getProfileBranchScope(auth.session.profile), lines.map((line) => line.branchId),
  );
  if (scopeError) return { error: scopeError };
  const { error } = await supabase.rpc("online_order_accept", {
    p_order_id: orderId,
    p_lines: lines.map((line) => ({
      item_id: line.itemId,
      branch_id: line.branchId,
      quantity: line.quantity,
    })),
  });
  if (error) return { error: error.message };
  revalidateOrder(orderId);
  return {};
}

export async function rejectOnlineOrder(orderId: string, reason: string | null): Promise<{ error?: string }> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(orderId)) return { error: "El pedido no es válido" };
  const invalidReason = reasonError(reason);
  if (invalidReason) return { error: invalidReason };
  const supabase = await createClient();
  const scopeError = await checkBranchScope(supabase, orderId, getProfileBranchScope(auth.session.profile), []);
  if (scopeError) return { error: scopeError };
  const { error } = await supabase.rpc("online_order_reject", { p_order_id: orderId, p_reason: reason });
  if (error) return { error: error.message };
  revalidateOrder(orderId);
  return {};
}

export async function cancelOnlineOrder(orderId: string, reason: string | null): Promise<{ error?: string }> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(orderId)) return { error: "El pedido no es válido" };
  const invalidReason = reasonError(reason);
  if (invalidReason) return { error: invalidReason };
  const supabase = await createClient();
  const scopeError = await checkBranchScope(supabase, orderId, getProfileBranchScope(auth.session.profile), []);
  if (scopeError) return { error: scopeError };
  const { error } = await supabase.rpc("online_order_cancel", { p_order_id: orderId, p_reason: reason });
  if (error) return { error: error.message };
  revalidateOrder(orderId);
  return {};
}

export async function extendOnlineOrder(orderId: string, hours: number | null): Promise<{ error?: string }> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(orderId)) return { error: "El pedido no es válido" };
  if (hours !== null && (!Number.isInteger(hours) || hours < 1 || hours > 168)) {
    return { error: "Las horas deben ser un número entero entre 1 y 168" };
  }
  const supabase = await createClient();
  const scopeError = await checkBranchScope(supabase, orderId, getProfileBranchScope(auth.session.profile), []);
  if (scopeError) return { error: scopeError };
  const { error } = await supabase.rpc("online_order_extend", { p_order_id: orderId, p_hours: hours });
  if (error) return { error: error.message };
  revalidateOrder(orderId);
  return {};
}
