import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fmtUSD, fmtVES, fmtRelative } from "@/lib/format";
import type { ShellNotification } from "@/components/shell/header";
import type { BcvRate } from "@/lib/bcv";

export type ShellData = {
  lowStock: number;
  outStock: number;
  notifications: ShellNotification[];
};

/** Sidebar badge counts + header notifications, scoped to the active branch. */
export async function getShellData(
  bcv: BcvRate,
  branchId: string | null,
): Promise<ShellData> {
  const supabase = await createClient();

  let lowQ = supabase
    .from("v_inventory")
    .select("id", { count: "exact", head: true })
    .eq("estado", "Stock bajo");
  let outQ = supabase
    .from("v_inventory")
    .select("id", { count: "exact", head: true })
    .eq("estado", "Agotado");
  if (branchId) {
    lowQ = lowQ.eq("branch_id", branchId);
    outQ = outQ.eq("branch_id", branchId);
  }

  let saleQ = supabase
    .from("sales")
    .select("invoice_number, total, created_at, branch_id")
    .order("created_at", { ascending: false })
    .limit(1);
  if (branchId) saleQ = saleQ.eq("branch_id", branchId);
  const poQ = supabase
    .from("purchase_orders")
    .select("code, expected_date, status")
    .eq("status", "En tránsito")
    .order("expected_date", { ascending: true })
    .limit(1);
  const [countsRes, saleRes, poRes] = await Promise.all([
    supabase
      .rpc("inventory_status_counts", { p_branch_id: branchId })
      .maybeSingle(),
    saleQ,
    poQ,
  ]);
  let lowStock = Number(countsRes.data?.low_stock ?? 0);
  let outStock = Number(countsRes.data?.out_stock ?? 0);
  // Keeps rolling deployments functional until the SQL migration is applied.
  if (countsRes.error) {
    const [lowRes, outRes] = await Promise.all([lowQ, outQ]);
    lowStock = lowRes.count ?? 0;
    outStock = outRes.count ?? 0;
  }
  const latestSale = saleRes.data?.[0];
  const pos = poRes.data;
  const latestPo = pos?.[0];

  const notifications: ShellNotification[] = [];
  if (outStock > 0 || lowStock > 0) {
    notifications.push({
      id: "stock",
      icon: "alert",
      title: "Stock crítico",
      body: `${lowStock} bajo el mínimo · ${outStock} agotados`,
      time: "ahora",
      tone: "danger",
    });
  }
  if (latestSale) {
    notifications.push({
      id: "sale",
      icon: "cart",
      title: "Nueva venta",
      body: `${latestSale.invoice_number} · ${fmtUSD(latestSale.total)}`,
      time: fmtRelative(latestSale.created_at),
      tone: "brand",
    });
  }
  if (latestPo) {
    notifications.push({
      id: "po",
      icon: "truck",
      title: "Orden en tránsito",
      body: `${latestPo.code} llega el ${latestPo.expected_date ?? "—"}`,
      time: "pendiente",
      tone: "success",
    });
  }
  notifications.push({
    id: "rate",
    icon: "refresh",
    title: "Tasa actualizada",
    body: `BCV: ${fmtVES(bcv.rate)} por USD`,
    time: fmtRelative(bcv.updatedAt),
    tone: "muted",
  });

  return { lowStock, outStock, notifications };
}
