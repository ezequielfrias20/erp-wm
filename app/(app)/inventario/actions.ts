"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

export type FormState = { error?: string; ok?: boolean } | null;

export async function updateStock(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Registro inválido." };
  const quantity = Number(formData.get("quantity") ?? 0);
  const reserved = Number(formData.get("reserved") ?? 0);
  const min_stock = Number(formData.get("min_stock") ?? 0);
  const sku = String(formData.get("sku") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory")
    .update({ quantity, reserved, min_stock })
    .eq("id", id);
  if (error) return { error: error.message };

  await audit(`Ajustó inventario ${sku} (${quantity} uds)`, "Inventario");
  revalidatePath("/inventario");
  revalidatePath("/", "layout");
  return { ok: true };
}
