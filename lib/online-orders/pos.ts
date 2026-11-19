import type { PosProduct } from "@/components/ventas/pos-view";
import type { PosOnlineOrder } from "@/lib/queries/online-orders";

export type CartLineSeed = { variantId: string; qty: number; price: number };

export function clampToStock(
  lines: CartLineSeed[],
  products: PosProduct[],
): { lines: CartLineSeed[]; limited: string[] } {
  const byVariant = new Map(products.map((product) => [product.variant_id, product]));
  const remaining = new Map(products.map((product) => [product.variant_id, Math.max(product.stock, 0)]));
  const clamped: CartLineSeed[] = [];
  const limited: string[] = [];
  for (const line of lines) {
    const product = byVariant.get(line.variantId);
    const available = remaining.get(line.variantId) ?? 0;
    const qty = Math.min(line.qty, available);
    if (qty > 0) clamped.push({ ...line, qty });
    remaining.set(line.variantId, available - qty);
    if (qty < line.qty) {
      limited.push(`${product?.product_name ?? line.variantId}: pedido ${line.qty}, disponible ${qty}`);
    }
  }
  return { lines: clamped, limited };
}

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
