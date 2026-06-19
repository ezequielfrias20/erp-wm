"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

export type FormState = { error?: string; ok?: boolean } | null;

function parse(formData: FormData) {
  const num = (k: string) => {
    const v = formData.get(k);
    return v === null || v === "" ? null : Number(v);
  };
  return {
    code: String(formData.get("code") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    monthly_goal: num("monthly_goal") ?? 0,
    color: String(formData.get("color") ?? "").trim() || null,
    manager_id: String(formData.get("manager_id") ?? "").trim() || null,
    map_x: num("map_x"),
    map_y: num("map_y"),
  };
}

export async function saveBranch(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const values = parse(formData);
  if (!values.code || !values.city || !values.name) {
    return { error: "Código, ciudad y nombre son obligatorios." };
  }

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("branches").update(values).eq("id", id);
    if (error) return { error: error.message };
    await audit(`Editó la sucursal ${values.city}`, "Sucursales");
  } else {
    const { error } = await supabase.from("branches").insert(values);
    if (error) return { error: error.message };
    await audit(`Creó la sucursal ${values.city}`, "Sucursales");
  }

  revalidatePath("/sucursales");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteBranch(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("branches").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("Eliminó una sucursal", "Sucursales", "warn");
  revalidatePath("/sucursales");
  revalidatePath("/", "layout");
  return { ok: true };
}
