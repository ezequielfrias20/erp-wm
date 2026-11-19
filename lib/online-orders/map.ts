import type { OnlineOrderItem, VOnlineOrder } from "@/lib/database.types";
import type { OnlineOrderView } from "./types";

export type VOnlineOrderRow = Pick<
  VOnlineOrder,
  "id" | "number" | "status" | "effective_status" | "customer_name" |
  "customer_phone" | "customer_email" | "customer_document" | "notes" |
  "created_at" | "soft_expires_at" | "firm_expires_at" | "expires_at" |
  "total" | "branch_count" | "close_reason"
>;

export type ItemRow = Pick<
  OnlineOrderItem,
  "id" | "order_id" | "variant_id" | "branch_id" | "quantity" | "unit_price" |
  "product_name" | "variant_label" | "sku" | "sale_id" | "released_at"
>;

export function mapOrderRow(
  row: VOnlineOrderRow,
  items: ItemRow[],
  branchNames: Map<string, string>,
  invoices: Map<string, string>,
): OnlineOrderView {
  return {
    id: row.id,
    number: row.number,
    status: row.effective_status,
    storedStatus: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerDocument: row.customer_document,
    notes: row.notes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    softExpiresAt: row.soft_expires_at,
    firmExpiresAt: row.firm_expires_at,
    total: Number(row.total),
    branchCount: Number(row.branch_count),
    closeReason: row.close_reason,
    items: items.map((item) => ({
      id: item.id,
      variantId: item.variant_id,
      branchId: item.branch_id,
      branchName: branchNames.get(item.branch_id) ?? item.branch_id,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      productName: item.product_name,
      variantLabel: item.variant_label,
      sku: item.sku,
      saleId: item.sale_id,
      invoiceNumber: item.sale_id ? invoices.get(item.sale_id) ?? null : null,
      releasedAt: item.released_at,
    })),
  };
}
