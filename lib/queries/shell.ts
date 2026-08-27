import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fmtUSD, fmtVES, fmtRelative } from "@/lib/format";
import type { ShellNotification, ShellSummary } from "@/components/shell/shell-data";
import type { BcvRate } from "@/lib/bcv";
import { rpcOrFallback } from "@/lib/db-capabilities";

type StatusCounts = { low_stock: number; out_stock: number };

export type ShellData = ShellSummary;

/** Sidebar badge counts + header notifications, scoped to the active branch. */
export async function getShellData(
  bcv: BcvRate,
  branchId: string | null,
): Promise<ShellData> {
  const supabase = await createClient();

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

  // Los conteos van en paralelo con las notificaciones. Si `inventory_status_counts`
  // no está en el esquema, `rpcOrFallback` lo recuerda y las siguientes peticiones
  // van directo a los dos `count` sin gastar antes una RPC que va a fallar.
  const countsPromise = rpcOrFallback<StatusCounts>(
    "inventory_status_counts",
    async () => {
      const { data, error } = await supabase
        .rpc("inventory_status_counts", { p_branch_id: branchId })
        .maybeSingle();
      return {
        data: data
          ? {
              low_stock: Number(data.low_stock ?? 0),
              out_stock: Number(data.out_stock ?? 0),
            }
          : { low_stock: 0, out_stock: 0 },
        error,
      };
    },
    async () => {
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
      const [lowRes, outRes] = await Promise.all([lowQ, outQ]);
      return { low_stock: lowRes.count ?? 0, out_stock: outRes.count ?? 0 };
    },
  );

  const [counts, saleRes, poRes] = await Promise.all([countsPromise, saleQ, poQ]);
  const lowStock = counts.low_stock;
  const outStock = counts.out_stock;
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
