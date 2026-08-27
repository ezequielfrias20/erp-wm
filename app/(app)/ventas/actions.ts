"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getProfileBranchScope } from "@/lib/branch";
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
  request_id: string;
  branch_id: string;
  customer_id: string;
  seller_id: string;
  seller_code: string;
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
  if (!input.seller_id) return { error: "Selecciona el vendedor de la venta." };
  if (!input.seller_code.trim()) return { error: "Ingresa el código del vendedor." };
  if (!/^\d{4}$/.test(input.seller_code.trim())) {
    return { error: "El código del vendedor debe tener 4 dígitos." };
  }
  if (!input.payments.length) return { error: "Configura al menos un método de pago." };

  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." };
  const assignedBranchId = getProfileBranchScope(session.profile);
  if (assignedBranchId && input.branch_id !== assignedBranchId) {
    return { error: "No puedes registrar ventas en otra sucursal." };
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id)) {
    return { error: "Identificador de operación inválido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_sale", {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    p_payments: input.payments,
    p_discount_pct: input.discount_pct,
    p_rate: input.rate,
    p_items: input.items.map((item) => ({ ...item, request_id: input.request_id })),
    p_status: input.status ?? "Pagada",
    p_cashea: input.cashea ?? null,
    p_seller_id: input.seller_id,
    p_seller_code: input.seller_code.trim(),
  });

  if (error) return { error: error.message };
  // Keep checkout fast: only invalidate views whose persisted aggregates changed.
  // The POS updates its cart/stock optimistically after this action returns.
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
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();
  const assignedBranchId = getProfileBranchScope(session.profile);
  let query = supabase
    .from("customers")
    .select("id, name, document, segment, phone, email")
    .ilike("document", d)
    .limit(1);
  if (assignedBranchId) query = query.eq("branch_id", assignedBranchId);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

/** Crea un cliente desde el POS y lo devuelve para auto-seleccionarlo. */
export async function createPosCustomer(input: {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  segment?: CustomerSegment;
  branch_id?: string | null;
}): Promise<{ customer?: PosCustomerRow; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "El nombre es obligatorio." };
  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." };
  const branchId = getProfileBranchScope(session.profile) ?? input.branch_id ?? null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name,
      document: input.document?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      segment: input.segment ?? "Nuevo",
      branch_id: branchId,
    })
    .select("id, name, document, segment, phone, email")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/clientes");
  return { customer: data };
}
