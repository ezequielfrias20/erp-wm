/**
 * Hand-written types for the `wm` schema (World Medics ERP).
 * The Supabase MCP type generator only emits the `public` schema, and our tables live in `wm`,
 * so these mirror the migrations in supabase/. Keep in sync when the schema changes.
 */

export type Role =
  | "Super Admin"
  | "Administrador"
  | "Gerente"
  | "Vendedor"
  | "Inventario"
  | "Cajero";

export type CustomerSegment = "VIP" | "Frecuente" | "Nuevo" | "Inactivo";
export type SaleStatus = "Pagada" | "Pendiente" | "Reembolso" | "Anulada";
export type PurchaseStatus =
  | "Pendiente"
  | "Confirmado"
  | "En tránsito"
  | "Recibido";
export type UserStatus = "Activo" | "Inactivo";
export type AuditSeverity = "ok" | "edit" | "sys" | "warn";
export type EventType = "compra" | "pago" | "nota" | "registro";

export const MODULES = [
  "Dashboard",
  "Ventas",
  "Inventario",
  "Productos",
  "Clientes",
  "Sucursales",
  "Usuarios",
  "Reportes",
  "Configuración",
] as const;
export type ModuleName = (typeof MODULES)[number];

export type Branch = {
  id: string;
  code: string;
  city: string;
  name: string;
  address: string | null;
  phone: string | null;
  manager_id: string | null;
  monthly_goal: number;
  color: string | null;
  map_x: number | null;
  map_y: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Category = {
  id: string;
  name: string;
  slug: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Brand = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Size = {
  id: string;
  label: string;
  sort_order: number;
}

export type ColorRow = {
  id: string;
  name: string;
  hex: string | null;
  sort_order: number;
}

export type Supplier = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Product = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  tax_rate: number;
  is_active: boolean;
  visible_in_catalog: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type ProductVariant = {
  id: string;
  product_id: string;
  sku: string;
  color: string | null;
  color_hex: string | null;
  size: string | null;
  barcode: string | null;
  price: number;
  cost: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Inventory = {
  id: string;
  variant_id: string;
  branch_id: string;
  quantity: number;
  reserved: number;
  min_stock: number;
  updated_at: string;
}

export type Profile = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  branch_id: string | null;
  status: UserStatus;
  avatar_url: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  segment: CustomerSegment;
  city: string | null;
  branch_id: string | null;
  since: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomerEvent = {
  id: string;
  customer_id: string;
  type: EventType;
  title: string;
  detail: string | null;
  amount: number | null;
  occurred_at: string;
}

export type Sale = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  branch_id: string;
  user_id: string | null;
  payment_method: string | null;
  subtotal: number;
  discount: number;
  discount_pct: number;
  tax: number;
  total: number;
  exchange_rate: number | null;
  total_ves: number | null;
  status: SaleStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type SaleItem = {
  id: string;
  sale_id: string;
  variant_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  cost: number;
  line_total: number;
}

export type PurchaseOrder = {
  id: string;
  code: string;
  supplier_id: string | null;
  branch_id: string | null;
  status: PurchaseStatus;
  expected_date: string | null;
  total: number;
  created_at: string;
  updated_at: string;
}

export type PurchaseOrderItem = {
  id: string;
  po_id: string;
  variant_id: string | null;
  quantity: number;
  cost: number;
}

export type RoleRow = {
  id: string;
  name: string;
  sort_order: number;
}

export type RolePermission = {
  id: string;
  role: string;
  module: string;
  level: number; // 0 sin acceso, 1 ver, 2 total
}

export type PaymentMethod = {
  id: string;
  name: string;
  enabled: boolean;
  sort_order: number;
}

export type ExchangeRate = {
  id: string;
  source: string;
  rate: number;
  fetched_at: string;
  effective_date: string;
}

export type AuditLog = {
  id: string;
  user_id: string | null;
  who: string | null;
  action: string;
  module: string | null;
  ip: string | null;
  severity: AuditSeverity;
  created_at: string;
}

export type Settings = {
  id: number;
  company_name: string | null;
  rif: string | null;
  fiscal_address: string | null;
  phone: string | null;
  taxpayer_type: string | null;
  iva_retention: boolean;
  iva_general: number;
  currency: string;
  auto_update_rate: boolean;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  notifications: Record<string, boolean>;
  updated_at: string;
}

export type VInventory = {
  id: string;
  variant_id: string;
  branch_id: string;
  quantity: number;
  reserved: number;
  min_stock: number;
  sku: string;
  color: string | null;
  color_hex: string | null;
  size: string | null;
  price: number;
  cost: number;
  product_id: string;
  product_name: string;
  category: string | null;
  category_color: string | null;
  brand: string | null;
  branch_city: string;
  branch_code: string;
  estado: "Agotado" | "Stock bajo" | "En stock";
  stock_value: number;
}

export type VBranchStats = {
  id: string;
  code: string;
  city: string;
  name: string;
  address: string | null;
  phone: string | null;
  monthly_goal: number;
  color: string | null;
  map_x: number | null;
  map_y: number | null;
  is_active: boolean;
  manager_id: string | null;
  manager_name: string | null;
  inventory_units: number;
  month_sales: number;
};

export type VProductSummary = {
  id: string;
  name: string;
  is_active: boolean;
  visible_in_catalog: boolean;
  tax_rate: number;
  category_id: string | null;
  brand_id: string | null;
  category: string | null;
  category_color: string | null;
  brand: string | null;
  variant_count: number;
  min_price: number;
  max_price: number;
  total_stock: number;
};

export type VCustomerStats = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  segment: CustomerSegment;
  city: string | null;
  branch_id: string | null;
  since: string;
  notes: string | null;
  created_at: string;
  branch_city: string | null;
  total_spent: number;
  orders_count: number;
  avg_ticket: number;
};

export type VCustomerFavorite = {
  customer_id: string;
  product_name: string;
  qty: number;
};

export type VSaleLine = {
  id: string;
  sale_id: string;
  branch_id: string;
  created_at: string;
  status: SaleStatus;
  payment_method: string | null;
  quantity: number;
  line_total: number;
  cost: number;
  product_name: string | null;
  category: string | null;
  category_color: string | null;
};

type Tbl<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
type Vw<T> = { Row: T; Relationships: [] };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  wm: {
    Tables: {
      branches: Tbl<Branch>;
      categories: Tbl<Category>;
      brands: Tbl<Brand>;
      sizes: Tbl<Size>;
      colors: Tbl<ColorRow>;
      suppliers: Tbl<Supplier>;
      products: Tbl<Product>;
      product_variants: Tbl<ProductVariant>;
      inventory: Tbl<Inventory>;
      profiles: Tbl<Profile>;
      customers: Tbl<Customer>;
      customer_events: Tbl<CustomerEvent>;
      sales: Tbl<Sale>;
      sale_items: Tbl<SaleItem>;
      purchase_orders: Tbl<PurchaseOrder>;
      purchase_order_items: Tbl<PurchaseOrderItem>;
      roles: Tbl<RoleRow>;
      role_permissions: Tbl<RolePermission>;
      payment_methods: Tbl<PaymentMethod>;
      exchange_rates: Tbl<ExchangeRate>;
      audit_log: Tbl<AuditLog>;
      settings: Tbl<Settings>;
    };
    Views: {
      v_inventory: Vw<VInventory>;
      v_branch_stats: Vw<VBranchStats>;
      v_product_summary: Vw<VProductSummary>;
      v_customer_stats: Vw<VCustomerStats>;
      v_customer_favorites: Vw<VCustomerFavorite>;
      v_sale_lines: Vw<VSaleLine>;
    };
    Functions: {
      is_member: { Args: Record<string, never>; Returns: boolean };
      my_role: { Args: Record<string, never>; Returns: string };
      my_profile_id: { Args: Record<string, never>; Returns: string };
      has_module: { Args: { p_module: string; p_min?: number }; Returns: boolean };
      claim_profile: { Args: Record<string, never>; Returns: Profile };
      create_sale: {
        Args: {
          p_branch_id: string;
          p_customer_id: string | null;
          p_payment_method: string;
          p_discount_pct: number;
          p_rate: number;
          p_items: unknown;
          p_status?: string;
        };
        Returns: Sale;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
