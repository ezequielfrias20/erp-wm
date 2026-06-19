"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

export type FormState = { error?: string; ok?: boolean; id?: string } | null;

export async function saveProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "El nombre es obligatorio." };

  const values = {
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    category_id: String(formData.get("category_id") ?? "").trim() || null,
    brand_id: String(formData.get("brand_id") ?? "").trim() || null,
    tax_rate: Number(formData.get("tax_rate") ?? 16),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    visible_in_catalog:
      formData.get("visible_in_catalog") === "on" ||
      formData.get("visible_in_catalog") === "true",
    tags: String(formData.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("products").update(values).eq("id", id);
    if (error) return { error: error.message };
    await audit(`Editó el producto ${name}`, "Productos");
    revalidatePath(`/productos/${id}`);
    revalidatePath("/productos");
    return { ok: true, id };
  } else {
    const { data, error } = await supabase
      .from("products")
      .insert(values)
      .select("id")
      .single();
    if (error) return { error: error.message };
    await audit(`Creó el producto ${name}`, "Productos");
    revalidatePath("/productos");
    return { ok: true, id: data.id };
  }
}

export async function deleteProduct(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("Eliminó un producto", "Productos", "warn");
  revalidatePath("/productos");
  return { ok: true };
}

export async function saveVariant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  if (!sku || !productId) return { error: "SKU y producto son obligatorios." };

  const values = {
    product_id: productId,
    sku,
    color: String(formData.get("color") ?? "").trim() || null,
    color_hex: String(formData.get("color_hex") ?? "").trim() || null,
    size: String(formData.get("size") ?? "").trim() || null,
    price: Number(formData.get("price") ?? 0),
    cost: Number(formData.get("cost") ?? 0),
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("product_variants").update(values).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("product_variants").insert(values);
    if (error) return { error: error.message };
  }
  await audit(`Actualizó variante ${sku}`, "Productos");
  revalidatePath(`/productos/${productId}`);
  return { ok: true };
}

export async function deleteVariant(
  id: string,
  productId: string,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("product_variants").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("Eliminó una variante", "Productos", "warn");
  revalidatePath(`/productos/${productId}`);
  return { ok: true };
}
