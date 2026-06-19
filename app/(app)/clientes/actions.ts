"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import type { CustomerSegment } from "@/lib/database.types";

export type FormState = { error?: string; ok?: boolean } | null;

export async function saveCustomer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "El nombre es obligatorio." };

  const values = {
    name,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    document: String(formData.get("document") ?? "").trim() || null,
    segment: (String(formData.get("segment") ?? "Nuevo") || "Nuevo") as CustomerSegment,
    city: String(formData.get("city") ?? "").trim() || null,
    branch_id: String(formData.get("branch_id") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("customers").update(values).eq("id", id);
    if (error) return { error: error.message };
    await audit(`Editó el cliente ${name}`, "Clientes");
  } else {
    const { data, error } = await supabase
      .from("customers")
      .insert(values)
      .select("id")
      .single();
    if (error) return { error: error.message };
    await supabase.from("customer_events").insert({
      customer_id: data.id,
      type: "registro",
      title: "Cliente registrado",
      detail: values.city ? `Alta en ${values.city}` : "Alta de cliente",
    });
    await audit(`Agregó el cliente ${name}`, "Clientes");
  }

  revalidatePath("/clientes");
  return { ok: true };
}

export async function deleteCustomer(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("Eliminó un cliente", "Clientes", "warn");
  revalidatePath("/clientes");
  return { ok: true };
}

export async function addNote(
  customerId: string,
  note: string,
): Promise<FormState> {
  if (!note.trim()) return { error: "La nota no puede estar vacía." };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_events").insert({
    customer_id: customerId,
    type: "nota",
    title: "Nota agregada",
    detail: note.trim(),
  });
  if (error) return { error: error.message };
  await audit("Agregó una nota de cliente", "Clientes");
  revalidatePath("/clientes");
  return { ok: true };
}
