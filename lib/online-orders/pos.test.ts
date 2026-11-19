import { describe, expect, it } from "vitest";
import type { PosProduct } from "@/components/ventas/pos-view";
import type { PosOnlineOrder } from "@/lib/queries/online-orders";
import { cartFromOnlineOrder, stockWithOwnHold } from "./pos";

const product: PosProduct = {
  product_id: "P", variant_id: "V", product_image_url: null, sku: "SKU-V",
  aliases: [], product_name: "Bata", category: null, brand: null, price: 35,
  cost: 20, color: null, color_hex: null, size: null, stock: 3, online_held: 2,
};
const order: PosOnlineOrder = {
  orderId: "O", number: "W-000123", branchId: "A", holdLive: true,
  customer: { name: "Ana", phone: "04121234567", email: null, document: null },
  matchedCustomerId: null,
  lines: [
    { variantId: "V", quantity: 2, unitPrice: 31.25, productName: "Bata", variantLabel: "Azul", sku: "SKU-V" },
    { variantId: "M", quantity: 1, unitPrice: 10, productName: "Guantes", variantLabel: "Mediano", sku: "SKU-M" },
  ],
};

describe("stockWithOwnHold", () => {
  it("suma la reserva propia a la variante del pedido cuando sigue vigente", () => {
    expect(stockWithOwnHold([product], order)[0].stock).toBe(5);
    expect(product.stock).toBe(3);
  });

  it("no suma la reserva vencida", () => {
    expect(stockWithOwnHold([product], { ...order, holdLive: false })[0].stock).toBe(3);
  });
});

describe("cartFromOnlineOrder", () => {
  it("usa el precio congelado y describe las variantes ausentes", () => {
    expect(cartFromOnlineOrder(order, [product])).toEqual({
      lines: [{ variantId: "V", qty: 2, price: 31.25 }],
      missing: ["Guantes · Mediano · SKU SKU-M"],
    });
  });
});
