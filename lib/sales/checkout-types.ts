/**
 * Contrato del cobro, compartido por el navegador y el servidor.
 *
 * Vive aparte (sin importar nada del servidor) porque lo consume tanto el POS
 * —componente de cliente— como el Route Handler que registra la venta.
 */

export type CheckoutItem = {
  variant_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  cost: number;
};

export type SalePaymentInput = {
  method: string;
  currency: "USD" | "VES";
  amount: number; // monto en la moneda nativa del método
  amount_usd: number; // normalizado a USD
  reference: string | null;
};

// Datos de la cuenta por cobrar a Cashea cuando la venta se financia con Cashea.
export type CasheaInput = {
  reference: string; // nro de orden Cashea
  initial_amount: number; // inicial cobrado en caja (USD)
  financed_amount: number; // por cobrar a Cashea (USD) = total − inicial
  commission_pct: number; // 0 en el POS salvo que se conozca
  channel: "tienda" | "online"; // canal: en sucursal o marketplace
};

export type CheckoutInput = {
  request_id: string;
  branch_id: string;
  customer_id: string;
  seller_id: string;
  payments: SalePaymentInput[];
  discount_pct: number;
  rate: number;
  items: CheckoutItem[];
  status?: "Pagada" | "Pendiente";
  cashea?: CasheaInput;
};

export type CheckoutResult = {
  error?: string;
  invoice?: string;
  saleId?: string;
  createdAt?: string;
};

/** El POS reutiliza el mismo `request_id` al reintentar; el servidor lo exige v4. */
export const REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
