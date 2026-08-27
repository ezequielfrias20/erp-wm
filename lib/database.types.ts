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
export type ProjectStatus = "Borrador" | "Abierto" | "Cerrado" | "Cancelado";
export type ProjectType = "Evento" | "Curso";
export type ProjectOrderStatus =
  | "Por validar"
  | "Confirmado"
  | "Cancelado"
  | "Vencido";
export type ProjectPaymentMethod =
  | "Pago móvil"
  | "Efectivo USD"
  | "Zelle/Zinli"
  | "Binance"
  | "Cashea";
export type ProjectRegistrationStatus =
  | "Por validar"
  | "Confirmado"
  | "Cancelado";
export type ProjectTicketStatus =
  | "No emitido"
  | "Disponible"
  | "Usado"
  | "Anulado";

export const MODULES = [
  "Dashboard",
  "Ventas",
  "Inventario",
  "Productos",
  "Clientes",
  "Proyectos",
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
  email: string | null;
  phone: string | null;
  employee_code: string | null;
  system_access: boolean;
  commission_pct: number;
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

export type Project = {
  id: string;
  name: string;
  description: string | null;
  event_date: string | null;
  location: string | null;
  logo_url: string | null;
  ticket_title: string | null;
  ticket_subtitle: string | null;
  ticket_details: string | null;
  ticket_instructions: string | null;
  ticket_footer: string | null;
  ticket_accent_color: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
  organizer_phone: string | null;
  project_type: ProjectType;
  public_slug: string | null;
  public_registration_enabled: boolean;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  default_price_usd: number | null;
  registration_payment_instructions: string | null;
  timezone: string;
  status: ProjectStatus;
  goal: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectRegistration = {
  id: string;
  project_id: string;
  group_id: string | null;
  order_id: string | null;
  first_name: string;
  last_name: string;
  document: string;
  email: string;
  phone: string;
  payment_method: ProjectPaymentMethod;
  currency: "USD" | "VES";
  amount: number | null;
  amount_usd: number | null;
  exchange_rate: number | null;
  paid_at: string;
  payment_reference: string | null;
  receipt_url: string | null;
  receipt_storage_path: string | null;
  status: ProjectRegistrationStatus;
  ticket_hash: string | null;
  ticket_payload: string | null;
  ticket_qr_url: string | null;
  ticket_status: ProjectTicketStatus;
  ticket_issued_at: string | null;
  ticket_email_sent_at: string | null;
  ticket_email_id: string | null;
  ticket_used_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectRegistrationView = ProjectRegistration & {
  receipt_access_url: string | null;
}

export type ProjectGroup = {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  capacity: number;
  price_usd: number;
  status: ProjectStatus;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectSession = {
  id: string;
  group_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  instructor: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ProjectOrder = {
  id: string;
  project_id: string;
  group_id: string;
  code: string;
  quantity: number;
  currency: "USD" | "VES";
  amount: number;
  amount_usd: number;
  exchange_rate: number | null;
  payment_method: ProjectPaymentMethod;
  payment_reference: string | null;
  receipt_url: string | null;
  receipt_storage_path: string | null;
  status: ProjectOrderStatus;
  reservation_expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectCheckin = {
  id: string;
  registration_id: string;
  session_id: string;
  checked_in_at: string;
  checked_in_by: string | null;
  notes: string | null;
  created_at: string;
}

export type Sale = {
  id: string;
  request_id: string | null;
  invoice_number: string;
  customer_id: string | null;
  branch_id: string;
  user_id: string | null;
  seller_id: string | null;
  seller_commission_pct: number;
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
  currency: "USD" | "VES";
  requires_reference: boolean;
  is_financed: boolean; // true = financiamiento / por cobrar (Cashea), no es efectivo en caja
}

export type SalePayment = {
  id: string;
  sale_id: string;
  method: string;
  currency: "USD" | "VES";
  amount: number; // monto en la moneda nativa del método
  amount_usd: number; // normalizado a USD para agregaciones
  reference: string | null;
  created_at: string;
}

export type CasheaStatus = "pendiente" | "cobrada" | "anulada";
export type CasheaChannel = "tienda" | "online"; // tienda = en sucursal · online = marketplace

// Cuenta por cobrar a Cashea (1:1 con la venta). Todo en USD.
export type CasheaOrder = {
  id: string;
  sale_id: string;
  branch_id: string;
  reference: string; // nro de orden Cashea
  total: number; // snapshot del total de la venta (USD)
  initial_amount: number; // inicial cobrado en caja (USD)
  financed_amount: number; // por cobrar a Cashea (USD)
  commission_pct: number; // % retenido por Cashea
  commission_amount: number | null; // monto de comisión (al conciliar)
  net_amount: number | null; // neto recibido (al conciliar)
  status: CasheaStatus;
  channel: CasheaChannel; // canal de venta (comisión distinta por canal)
  settled_at: string | null;
  settled_amount: number | null; // lo que Cashea depositó (USD)
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  logo_dark_url: string | null;
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

export type ProductListItem = VProductSummary & {
  product_image_url: string | null;
  skus: string[];
  sizes: string[];
  colors: { name: string; hex: string | null }[];
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
      projects: Tbl<Project>;
      project_groups: Tbl<ProjectGroup>;
      project_sessions: Tbl<ProjectSession>;
      project_orders: Tbl<ProjectOrder>;
      project_registrations: Tbl<ProjectRegistration>;
      project_checkins: Tbl<ProjectCheckin>;
      sales: Tbl<Sale>;
      sale_items: Tbl<SaleItem>;
      sale_payments: Tbl<SalePayment>;
      cashea_orders: Tbl<CasheaOrder>;
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
      branding: {
        Args: Record<string, never>;
        Returns: {
          company_name: string | null;
          logo_url: string | null;
          logo_dark_url: string | null;
          favicon_url: string | null;
          primary_color: string | null;
          accent_color: string | null;
        }[];
      };
      inventory_status_counts: {
        Args: { p_branch_id?: string | null };
        Returns: { low_stock: number; out_stock: number }[];
      };
      write_audit: {
        Args: { p_action: string; p_module: string; p_severity?: string };
        Returns: undefined;
      };
      report_payments: {
        Args: { p_branch_id: string | null; p_from: string; p_to: string };
        Returns: {
          sale_id: string;
          method: string;
          currency: string;
          amount: number;
          amount_usd: number;
        }[];
      };
      create_sale: {
        Args: {
          p_branch_id: string;
          p_customer_id: string | null;
          p_payments: unknown; // SalePaymentInput[]
          p_discount_pct: number;
          p_rate: number;
          p_items: unknown;
          p_status?: string;
          p_cashea?: unknown; // CasheaInput | null
          p_seller_id?: string | null;
          p_seller_code?: string | null;
        };
        Returns: Sale;
      };
      create_course_order: {
        Args: {
          p_project_id: string;
          p_group_id: string;
          p_code: string;
          p_currency: "USD" | "VES";
          p_amount: number;
          p_amount_usd: number;
          p_exchange_rate: number | null;
          p_payment_method: ProjectPaymentMethod;
          p_payment_reference: string | null;
          p_receipt_storage_path: string | null;
          p_attendees: unknown;
          p_notes?: string | null;
        };
        Returns: {
          id: string;
          code: string;
          status: ProjectOrderStatus;
          quantity: number;
          registrationIds: string[];
          reservationExpiresAt: string | null;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
