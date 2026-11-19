import { describe, expect, it } from "vitest";
import { mapOrderRow, type ItemRow, type VOnlineOrderRow } from "./map";

const row: VOnlineOrderRow = {
  id: "order-1", number: "PED-000001", status: "solicitada", effective_status: "vencida",
  customer_name: "Ana Pérez", customer_phone: "+58 412 123 4567",
  customer_email: "ana@example.com", customer_document: "V-12345678", notes: null,
  created_at: "2026-11-19T10:00:00Z", soft_expires_at: "2026-11-19T10:30:00Z",
  firm_expires_at: null, expires_at: "2026-11-19T10:30:00Z",
  total: "87.50" as unknown as number, branch_count: 1, close_reason: null,
};

const item: ItemRow = {
  id: "item-1", order_id: "order-1", variant_id: "variant-1", branch_id: "branch-1",
  quantity: 2, unit_price: "43.75" as unknown as number, product_name: "Bata",
  variant_label: "Azul / M", sku: "BATA-M", sale_id: "sale-1", released_at: null,
};

describe("mapOrderRow", () => {
  it("usa el estado efectivo, conserva el guardado y convierte importes", () => {
    const mapped = mapOrderRow(row, [item], new Map([["branch-1", "Caracas"]]), new Map([["sale-1", "FAC-000001"]]));

    expect(mapped.status).toBe("vencida");
    expect(mapped.storedStatus).toBe("solicitada");
    expect(mapped.total).toBe(87.5);
    expect(mapped.items[0]).toMatchObject({
      branchName: "Caracas", invoiceNumber: "FAC-000001", unitPrice: 43.75,
      variantId: "variant-1", quantity: 2,
    });
  });

  it("deja la factura en null cuando la línea no tiene venta", () => {
    const mapped = mapOrderRow(row, [{ ...item, sale_id: null }], new Map(), new Map());
    expect(mapped.items[0].invoiceNumber).toBeNull();
  });
});
