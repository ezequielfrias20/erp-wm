"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/queries/session";
import { canEdit } from "@/lib/permissions";
import { getProfileBranchScope } from "@/lib/branch";

export type FormState = { error?: string; ok?: boolean } | null;

function stockNumber(value: FormDataEntryValue | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export async function createStockEntry(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const variantId = String(formData.get("variant_id") ?? "").trim();
  const branchId = String(formData.get("branch_id") ?? "").trim();
  if (!variantId) return { error: "Selecciona un producto." };
  if (!branchId) return { error: "Selecciona una sucursal." };

  const quantity = stockNumber(formData.get("quantity"));
  const reserved = stockNumber(formData.get("reserved"));
  const min_stock = stockNumber(formData.get("min_stock"));

  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." };
  if (!canEdit(session.permissions, "Inventario")) {
    return { error: "No tienes permiso para editar inventario." };
  }

  const assignedBranchId = getProfileBranchScope(session.profile);
  if (assignedBranchId && branchId !== assignedBranchId) {
    return { error: "No puedes crear inventario en otra sucursal." };
  }

  const supabase = await createClient();
  const [{ data: variant, error: variantError }, { data: branch, error: branchError }] =
    await Promise.all([
      supabase
        .from("product_variants")
        .select("id, sku, product_id")
        .eq("id", variantId)
        .maybeSingle(),
      supabase
        .from("branches")
        .select("id, city")
        .eq("id", branchId)
        .maybeSingle(),
    ]);

  if (variantError) return { error: variantError.message };
  if (branchError) return { error: branchError.message };
  if (!variant) return { error: "La variante seleccionada no existe." };
  if (!branch) return { error: "La sucursal seleccionada no existe." };

  const { error } = await supabase.from("inventory").upsert(
    {
      variant_id: variantId,
      branch_id: branchId,
      quantity,
      reserved,
      min_stock,
    },
    { onConflict: "variant_id,branch_id" },
  );
  if (error) return { error: error.message };

  await audit(
    `Registró inventario ${variant.sku} (${quantity} uds) en ${branch.city}`,
    "Inventario",
  );
  revalidatePath("/inventario");
  revalidatePath("/productos");
  revalidatePath(`/productos/${variant.product_id}`);
  return { ok: true };
}

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

  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." };
  if (!canEdit(session.permissions, "Inventario")) {
    return { error: "No tienes permiso para editar inventario." };
  }

  const supabase = await createClient();
  const assignedBranchId = getProfileBranchScope(session.profile);
  if (assignedBranchId) {
    const { data: current, error: currentError } = await supabase
      .from("inventory")
      .select("branch_id")
      .eq("id", id)
      .maybeSingle();
    if (currentError) return { error: currentError.message };
    if (!current || current.branch_id !== assignedBranchId) {
      return { error: "No puedes modificar inventario de otra sucursal." };
    }
  }

  const { error } = await supabase
    .from("inventory")
    .update({ quantity, reserved, min_stock })
    .eq("id", id);
  if (error) return { error: error.message };

  await audit(`Ajustó inventario ${sku} (${quantity} uds)`, "Inventario");
  revalidatePath("/inventario");
  return { ok: true };
}

export type ImportRow = {
  sku: string;
  branch: string;
  quantity: number;
  reserved?: number | null;
  min_stock?: number | null;
};

export type ImportResult = { imported?: number; skipped?: number; error?: string };

/** Bulk upsert of stock per (SKU × sucursal) from a parsed CSV. */
export async function importInventory(rows: ImportRow[]): Promise<ImportResult> {
  if (!rows.length) return { error: "El archivo no contiene filas." };
  const session = await getSession();
  if (!session) return { error: "Debes iniciar sesión." };
  if (!canEdit(session.permissions, "Inventario")) {
    return { error: "No tienes permiso para importar inventario." };
  }

  const supabase = await createClient();

  let branchesQ = supabase.from("branches").select("id, city, code");
  const assignedBranchId = getProfileBranchScope(session.profile);
  if (assignedBranchId) {
    branchesQ = branchesQ.eq("id", assignedBranchId);
  }

  const [{ data: variants }, { data: branches }] = await Promise.all([
    supabase.from("product_variants").select("id, sku"),
    branchesQ,
  ]);
  const vMap = new Map((variants ?? []).map((v) => [v.sku.toLowerCase(), v.id]));
  const bMap = new Map<string, string>();
  for (const b of branches ?? []) {
    bMap.set(b.city.toLowerCase(), b.id);
    bMap.set(b.code.toLowerCase(), b.id);
  }

  const num = (v: number | null | undefined): number | null =>
    v == null || !Number.isFinite(v) ? null : Math.max(0, Math.trunc(v));

  // Resolve rows + keep only matches.
  const resolved = rows
    .map((r) => ({
      variant_id: vMap.get(r.sku.toLowerCase()),
      branch_id: bMap.get(String(r.branch).trim().toLowerCase()),
      quantity: Number.isFinite(r.quantity) ? Math.max(0, Math.trunc(r.quantity)) : 0,
      reserved: num(r.reserved),
      min_stock: num(r.min_stock),
    }))
    .filter((r) => r.variant_id && r.branch_id) as {
    variant_id: string;
    branch_id: string;
    quantity: number;
    reserved: number | null;
    min_stock: number | null;
  }[];

  const skipped = rows.length - resolved.length;
  if (!resolved.length)
    return { error: "Ninguna fila coincidió con un SKU y una sucursal válidos.", skipped };

  // Merge with existing reserved/min_stock so una columna omitida no los resetea.
  const variantIds = [...new Set(resolved.map((r) => r.variant_id))];
  const { data: existing } = await supabase
    .from("inventory")
    .select("variant_id, branch_id, reserved, min_stock")
    .in("variant_id", variantIds);
  const existingMap = new Map(
    (existing ?? []).map((e) => [
      `${e.variant_id}:${e.branch_id}`,
      { reserved: e.reserved, min_stock: e.min_stock },
    ]),
  );

  const payload = resolved.map((r) => {
    const prev = existingMap.get(`${r.variant_id}:${r.branch_id}`);
    return {
      variant_id: r.variant_id,
      branch_id: r.branch_id,
      quantity: r.quantity,
      reserved: r.reserved ?? prev?.reserved ?? 0,
      min_stock: r.min_stock ?? prev?.min_stock ?? 0,
    };
  });

  const { error } = await supabase
    .from("inventory")
    .upsert(payload, { onConflict: "variant_id,branch_id" });
  if (error) return { error: error.message, skipped };

  await audit(`Importó inventario (${payload.length} filas)`, "Inventario");
  revalidatePath("/inventario");
  return { imported: payload.length, skipped };
}
