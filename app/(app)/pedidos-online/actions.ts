"use server";

import { revalidatePath } from "next/cache";
import { canEdit } from "@/lib/permissions";
import { getSession } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";

async function authorize() {
  const session = await getSession();
  if (!session) return "Debes iniciar sesión.";
  if (!canEdit(session.permissions, "Ventas")) return "No autorizado para gestionar pedidos online.";
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
  const denied = await authorize();
  if (denied) return { error: denied };
  const supabase = await createClient();
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
  const denied = await authorize();
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("online_order_reject", { p_order_id: orderId, p_reason: reason });
  if (error) return { error: error.message };
  revalidateOrder(orderId);
  return {};
}

export async function cancelOnlineOrder(orderId: string, reason: string | null): Promise<{ error?: string }> {
  const denied = await authorize();
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("online_order_cancel", { p_order_id: orderId, p_reason: reason });
  if (error) return { error: error.message };
  revalidateOrder(orderId);
  return {};
}

export async function extendOnlineOrder(orderId: string, hours: number | null): Promise<{ error?: string }> {
  const denied = await authorize();
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("online_order_extend", { p_order_id: orderId, p_hours: hours });
  if (error) return { error: error.message };
  revalidateOrder(orderId);
  return {};
}
