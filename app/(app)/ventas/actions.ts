"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CheckoutItem = {
  variant_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  cost: number;
};

export type CheckoutInput = {
  branch_id: string;
  customer_id: string | null;
  payment_method: string;
  discount_pct: number;
  rate: number;
  items: CheckoutItem[];
  status?: "Pagada" | "Pendiente";
};

export async function checkout(
  input: CheckoutInput,
): Promise<{ error?: string; invoice?: string }> {
  if (!input.items.length) return { error: "El ticket está vacío." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_sale", {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    p_payment_method: input.payment_method,
    p_discount_pct: input.discount_pct,
    p_rate: input.rate,
    p_items: input.items,
    p_status: input.status ?? "Pagada",
  });

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  revalidatePath("/ventas");
  revalidatePath("/inventario");
  revalidatePath("/dashboard");
  return { invoice: data.invoice_number };
}
