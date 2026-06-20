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

export type ImportRow = {
  sku: string;
  branch: string;
  quantity: number;
  min_stock?: number | null;
};

export type ImportResult = { imported?: number; skipped?: number; error?: string };

/** Bulk upsert of stock per (SKU × sucursal) from a parsed CSV. */
export async function importInventory(rows: ImportRow[]): Promise<ImportResult> {
  if (!rows.length) return { error: "El archivo no contiene filas." };
  const supabase = await createClient();

  const skus = [...new Set(rows.map((r) => r.sku.toLowerCase()))];
  const [{ data: variants }, { data: branches }] = await Promise.all([
    supabase.from("product_variants").select("id, sku"),
    supabase.from("branches").select("id, city, code"),
  ]);
  const vMap = new Map((variants ?? []).map((v) => [v.sku.toLowerCase(), v.id]));
  const bMap = new Map<string, string>();
  for (const b of branches ?? []) {
    bMap.set(b.city.toLowerCase(), b.id);
    bMap.set(b.code.toLowerCase(), b.id);
  }

  // Resolve rows + keep only matches.
  const resolved = rows
    .map((r) => ({
      variant_id: vMap.get(r.sku.toLowerCase()),
      branch_id: bMap.get(String(r.branch).trim().toLowerCase()),
      quantity: Number.isFinite(r.quantity) ? Math.max(0, Math.trunc(r.quantity)) : 0,
      min_stock:
        r.min_stock == null || !Number.isFinite(r.min_stock)
          ? null
          : Math.max(0, Math.trunc(r.min_stock)),
    }))
    .filter((r) => r.variant_id && r.branch_id) as {
    variant_id: string;
    branch_id: string;
    quantity: number;
    min_stock: number | null;
  }[];

  const skipped = rows.length - resolved.length;
  if (!resolved.length)
    return { error: "Ninguna fila coincidió con un SKU y una sucursal válidos.", skipped };

  // Merge with existing min_stock so an omitted column doesn't reset it.
  const variantIds = [...new Set(resolved.map((r) => r.variant_id))];
  const { data: existing } = await supabase
    .from("inventory")
    .select("variant_id, branch_id, min_stock")
    .in("variant_id", variantIds);
  const minMap = new Map(
    (existing ?? []).map((e) => [`${e.variant_id}:${e.branch_id}`, e.min_stock]),
  );

  const payload = resolved.map((r) => ({
    variant_id: r.variant_id,
    branch_id: r.branch_id,
    quantity: r.quantity,
    min_stock: r.min_stock ?? minMap.get(`${r.variant_id}:${r.branch_id}`) ?? 0,
  }));

  const { error } = await supabase
    .from("inventory")
    .upsert(payload, { onConflict: "variant_id,branch_id" });
  if (error) return { error: error.message, skipped };

  await audit(`Importó inventario (${payload.length} filas)`, "Inventario");
  revalidatePath("/inventario");
  revalidatePath("/", "layout");
  return { imported: payload.length, skipped };
}
