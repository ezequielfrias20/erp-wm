export type OnlineOrderStatus = "solicitada" | "aceptada" | "completada" | "rechazada" | "cancelada" | "vencida";

export type OnlineOrderItemView = {
  id: string;
  variantId: string;
  branchId: string;
  branchName: string;
  quantity: number;
  unitPrice: number;
  productName: string;
  variantLabel: string;
  sku: string;
  saleId: string | null;
  invoiceNumber: string | null;
  releasedAt: string | null;
};

export type OnlineOrderView = {
  id: string;
  number: string;
  status: OnlineOrderStatus;
  storedStatus: Exclude<OnlineOrderStatus, "vencida">;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerDocument: string | null;
  notes: string | null;
  createdAt: string;
  expiresAt: string | null;
  softExpiresAt: string;
  firmExpiresAt: string | null;
  total: number;
  branchCount: number;
  closeReason: string | null;
  items: OnlineOrderItemView[];
};

export type BranchGroup = {
  branchId: string;
  branchName: string;
  items: OnlineOrderItemView[];
  subtotal: number;
  state: "pendiente" | "vendido" | "liberado";
};

export type OrderAction = "aceptar" | "rechazar" | "extender" | "cancelar" | "convertir";
