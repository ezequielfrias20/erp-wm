"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getProfileBranchScope } from "@/lib/branch";
import type { CustomerSegment } from "@/lib/database.types";

// El cobro dejó de ser una Server Action: vive en `app/api/ventas/checkout/route.ts`
// para poder acotarlo y abortarlo (el porqué, en `lib/sales/checkout-client.ts`).
// Los tipos se re-exportan desde aquí para no romper a quien ya los importaba.
export type {
  CheckoutItem,
  SalePaymentInput,
  CasheaInput,
  CheckoutInput,
  CheckoutResult,
} from "@/lib/sales/checkout-types";

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
