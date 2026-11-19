import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/online-orders/rules";
import type { OnlineOrderStatus } from "@/lib/online-orders/types";

const TONE_CLASS = {
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  muted: "bg-surface-2 text-text-3",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
} as const;

export function StatusBadge({ status }: { status: OnlineOrderStatus }) {
  return <Badge className={TONE_CLASS[STATUS_TONE[status]]}>{STATUS_LABEL[status]}</Badge>;
}
