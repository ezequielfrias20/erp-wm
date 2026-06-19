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

  let invQ = supabase.from("v_inventory").select("estado, branch_city");
  if (branchId) invQ = invQ.eq("branch_id", branchId);
  const { data: inv } = await invQ;

  const lowStock = (inv ?? []).filter((r) => r.estado === "Stock bajo").length;
  const outStock = (inv ?? []).filter((r) => r.estado === "Agotado").length;

  let saleQ = supabase
    .from("sales")
    .select("invoice_number, total, created_at, branch_id")
    .order("created_at", { ascending: false })
    .limit(1);
  if (branchId) saleQ = saleQ.eq("branch_id", branchId);
  const { data: sales } = await saleQ;
  const latestSale = sales?.[0];

  const { data: pos } = await supabase
    .from("purchase_orders")
    .select("code, expected_date, status")
    .eq("status", "En tránsito")
    .order("expected_date", { ascending: true })
    .limit(1);
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
