import { roundMoney } from "@/lib/sales/totals";
import type { BranchGroup, OnlineOrderItemView, OnlineOrderStatus, OnlineOrderView, OrderAction } from "./types";

export const STATUS_LABEL: Record<OnlineOrderStatus, string> = {
  solicitada: "Nueva",
  aceptada: "Aceptada",
  completada: "Completada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  vencida: "Vencida",
};

export const STATUS_TONE: Record<OnlineOrderStatus, "brand" | "success" | "muted" | "danger" | "warning"> = {
  solicitada: "brand",
  aceptada: "warning",
  completada: "success",
  rechazada: "muted",
  cancelada: "muted",
  vencida: "danger",
};

export function groupByBranch(items: OnlineOrderItemView[]): BranchGroup[] {
  const branches = new Map<string, BranchGroup>();

  for (const item of items) {
    let group = branches.get(item.branchId);
    if (!group) {
      group = { branchId: item.branchId, branchName: item.branchName, items: [], subtotal: 0, state: "pendiente" };
      branches.set(item.branchId, group);
    }
    group.items.push(item);
  }

  return [...branches.values()]
    .map((group) => ({
      ...group,
      subtotal: roundMoney(group.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)),
      state: group.items.every((item) => item.saleId !== null)
        ? "vendido" as const
        : group.items.every((item) => item.releasedAt !== null && item.saleId === null)
          ? "liberado" as const
          : "pendiente" as const,
    }))
    .sort((a, b) => a.branchName.localeCompare(b.branchName, "es-VE") || a.branchId.localeCompare(b.branchId));
}

export function availableActions(
  order: Pick<OnlineOrderView, "status" | "storedStatus">,
  canEdit: boolean,
): OrderAction[] {
  if (!canEdit) return [];
  if (order.storedStatus === "solicitada") return ["aceptar", "rechazar"];
  if (order.storedStatus === "aceptada") return ["convertir", "extender", "cancelar"];
  return [];
}

export function canConvertGroup(
  group: BranchGroup,
  opts: { assignedBranchId: string | null },
): { ok: true } | { ok: false; reason: string } {
  if (group.state !== "pendiente") return { ok: false, reason: "Este grupo ya no tiene productos pendientes" };
  if (opts.assignedBranchId && opts.assignedBranchId !== group.branchId) {
    return { ok: false, reason: "Sólo puedes vender en tu sucursal" };
  }
  return { ok: true };
}

export function timeLeftLabel(expiresAt: string | null, now: Date): string {
  if (!expiresAt) return "—";
  const milliseconds = new Date(expiresAt).getTime() - now.getTime();
  if (milliseconds <= 0) return "Vencido";
  const minutes = Math.ceil(milliseconds / 60_000);
  if (milliseconds < 60 * 60_000) return `Vence en ${minutes} min`;
  return `Vence en ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
