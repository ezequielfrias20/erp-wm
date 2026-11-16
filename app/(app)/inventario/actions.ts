"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId, getProfileBranchScope } from "@/lib/branch";
import { canEdit, canView } from "@/lib/permissions";
import { getInventoryOptions } from "@/lib/queries/inventory-options";
import { resolveImportSkus } from "@/lib/catalog/sku-alias";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { chunk } from "@/lib/chunk";
import {
  EMPTY_INVENTORY_OPTIONS,
  type InventoryOptions,
} from "@/lib/inventory-options";

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
  row?: number;
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

  const [variants, aliases, { data: branches }] = await Promise.all([
    fetchAllRows<{ id: string; sku: string }>((from, to) =>
      supabase.from("product_variants").select("id, sku").order("sku").range(from, to),
    ),
    fetchAllRows<{ variant_id: string; sku: string }>((from, to) =>
      supabase.from("variant_sku_aliases").select("variant_id, sku").order("sku").range(from, to),
    ),
    branchesQ,
  ]);
  const variantBySku = new Map(variants.map((variant) => [variant.sku, variant.id]));
  const variantByAlias = new Map(aliases.map((alias) => [alias.sku, alias.variant_id]));
  const bMap = new Map<string, string>();
  for (const b of branches ?? []) {
    bMap.set(b.city.toLowerCase(), b.id);
    bMap.set(b.code.toLowerCase(), b.id);
  }

  const num = (v: number | null | undefined): number | null =>
    v == null || !Number.isFinite(v) ? null : Math.max(0, Math.trunc(v));

  // La fila del archivo (`row`) sólo se usa para los mensajes; el cruce interno usa la posición
  // en el arreglo, que la calcula el servidor.
  const rowLabel = (row: ImportRow, index: number) =>
    Number.isInteger(row.row) && (row.row as number) > 0 ? (row.row as number) : index + 2;
  const numberedRows = rows.map((row, index) => ({
    ...row,
    index,
    label: rowLabel(row, index),
    branchId: bMap.get(String(row.branch).trim().toLowerCase()),
  }));
  const matchedBranches = numberedRows.filter((row) => row.branchId);
  const resolution = resolveImportSkus(
    matchedBranches.map((row) => ({ row: row.index, sku: row.sku, branch: row.branchId! })),
    variantBySku,
    variantByAlias,
  );

  // Con conflictos no se importa nada: el archivo se corrige y se vuelve a subir entero.
  if (resolution.conflicts.length) {
    const labelsByReason = new Map<"duplicate" | "alias", number[]>();
    for (const conflict of resolution.conflicts) {
      const labels = labelsByReason.get(conflict.reason) ?? [];
      labels.push(...conflict.rows.map((index) => numberedRows[index].label));
      labelsByReason.set(conflict.reason, labels);
    }
    const details = [...labelsByReason].map(([reason, labels]) => {
      const motive = reason === "duplicate"
        ? "SKU repetido en la misma sucursal"
        : "SKU anterior y actual de la misma variante en la misma sucursal";
      return `(${motive}): ${labels.sort((x, y) => x - y).join(", ")}`;
    });
    return {
      error: `Filas en conflicto ${details.join("; ")}. Corrige el archivo; no se importó nada.`,
      skipped: rows.length,
    };
  }

  const variantIdByIndex = new Map(resolution.resolved.map(({ row, variantId }) => [row, variantId]));
  const resolved = numberedRows
    .filter((row) => row.branchId && variantIdByIndex.has(row.index))
    .map((row) => ({
      variant_id: variantIdByIndex.get(row.index)!,
      branch_id: row.branchId!,
      quantity: Number.isFinite(row.quantity) ? Math.max(0, Math.trunc(row.quantity)) : 0,
      reserved: num(row.reserved),
      min_stock: num(row.min_stock),
    }));

  const skipped = rows.length - resolved.length;
  if (!resolved.length)
    return { error: "Ninguna fila coincidió con un SKU y una sucursal válidos.", skipped };

  // Merge with existing reserved/min_stock so una columna omitida no los resetea.
  const variantIds = [...new Set(resolved.map((r) => r.variant_id))];
  const existing = (
    await Promise.all(
      chunk(variantIds, 100).map(async (ids) => {
        const { data, error } = await supabase
          .from("inventory")
          .select("variant_id, branch_id, reserved, min_stock")
          .in("variant_id", ids);
        if (error) throw new Error(error.message);
        return data ?? [];
      }),
    )
  ).flat();
  const existingMap = new Map(
    existing.map((e) => [
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

/**
 * Catálogo de variantes y sucursales para la plantilla y el alta de inventario.
 * Se pide desde el cliente al abrir el diálogo, no en cada carga de la página.
 */
export async function loadInventoryOptions(): Promise<InventoryOptions> {
  const session = await getSession();
  if (!session || !canView(session.permissions, "Inventario")) {
    return EMPTY_INVENTORY_OPTIONS;
  }
  const branchId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );
  return getInventoryOptions(branchId);
}
