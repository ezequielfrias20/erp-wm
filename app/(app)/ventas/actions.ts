"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CustomerSegment } from "@/lib/database.types";

export type CheckoutItem = {
  variant_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  cost: number;
};

export type SalePaymentInput = {
  method: string;
  currency: "USD" | "VES";
  amount: number; // monto en la moneda nativa del método
  amount_usd: number; // normalizado a USD
  reference: string | null;
};

// Datos de la cuenta por cobrar a Cashea cuando la venta se financia con Cashea.
export type CasheaInput = {
  reference: string; // nro de orden Cashea
  initial_amount: number; // inicial cobrado en caja (USD)
  financed_amount: number; // por cobrar a Cashea (USD) = total − inicial
  commission_pct: number; // 0 en el POS salvo que se conozca
  channel: "tienda" | "online"; // canal: en sucursal o marketplace
};

export type CheckoutInput = {
  branch_id: string;
  customer_id: string;
  payments: SalePaymentInput[];
  discount_pct: number;
  rate: number;
  items: CheckoutItem[];
  status?: "Pagada" | "Pendiente";
  cashea?: CasheaInput;
};

export async function checkout(input: CheckoutInput): Promise<{
  error?: string;
  invoice?: string;
  saleId?: string;
  createdAt?: string;
}> {
  if (!input.items.length) return { error: "El ticket está vacío." };
  if (!input.customer_id) return { error: "Selecciona un cliente para cobrar la venta." };
  if (!input.payments.length) return { error: "Configura al menos un método de pago." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_sale", {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    p_payments: input.payments,
    p_discount_pct: input.discount_pct,
    p_rate: input.rate,
    p_items: input.items,
    p_status: input.status ?? "Pagada",
    p_cashea: input.cashea ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  revalidatePath("/ventas");
  revalidatePath("/inventario");
  revalidatePath("/dashboard");
  revalidatePath("/reportes");
  revalidatePath("/cashea");
  return { invoice: data.invoice_number, saleId: data.id, createdAt: data.created_at };
}

// ───────────────────────── Cliente en el POS ─────────────────────────

export type PosCustomerRow = {
  id: string;
  name: string;
  document: string | null;
  segment: string;
  phone: string | null;
  email: string | null;
};

/** Busca un cliente por documento/cédula (coincidencia exacta, sin distinguir mayúsculas). */
export async function findCustomerByDocument(
  doc: string,
): Promise<PosCustomerRow | null> {
  const d = doc.trim();
  if (!d) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, document, segment, phone, email")
    .ilike("document", d)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Crea un cliente desde el POS y lo devuelve para auto-seleccionarlo. */
export async function createPosCustomer(input: {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  segment?: CustomerSegment;
}): Promise<{ customer?: PosCustomerRow; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "El nombre es obligatorio." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name,
      document: input.document?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      segment: input.segment ?? "Nuevo",
    })
    .select("id, name, document, segment, phone, email")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/clientes");
  return { customer: data };
}
