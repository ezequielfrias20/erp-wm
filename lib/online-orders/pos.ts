import type { PosProduct } from "@/components/ventas/pos-view";
import type { PosOnlineOrder } from "@/lib/queries/online-orders";

export type CartLineSeed = { variantId: string; qty: number; price: number };

export function stockWithOwnHold(products: PosProduct[], order: PosOnlineOrder): PosProduct[] {
  if (!order.holdLive) return products;
  const heldByVariant = new Map<string, number>();
  for (const line of order.lines) {
    heldByVariant.set(line.variantId, (heldByVariant.get(line.variantId) ?? 0) + line.quantity);
  }
  return products.map((product) => ({
    ...product,
    stock: product.stock + (heldByVariant.get(product.variant_id) ?? 0),
  }));
}

export function cartFromOnlineOrder(
  order: PosOnlineOrder,
  products: PosProduct[],
): { lines: CartLineSeed[]; missing: string[] } {
  const available = new Set(products.map((product) => product.variant_id));
  const lines: CartLineSeed[] = [];
  const missing: string[] = [];
  for (const item of order.lines) {
    if (available.has(item.variantId)) {
      lines.push({ variantId: item.variantId, qty: item.quantity, price: item.unitPrice });
    } else {
      missing.push([item.productName, item.variantLabel, `SKU ${item.sku}`].filter(Boolean).join(" · "));
    }
  }
  return { lines, missing };
}
