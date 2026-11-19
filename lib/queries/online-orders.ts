import "server-only";

import { getProfileBranchScope } from "@/lib/branch";
import { inChunks } from "@/lib/chunk";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { canEdit, canView } from "@/lib/permissions";
import { mapOrderRow, type ItemRow, type VOnlineOrderRow } from "@/lib/online-orders/map";
import { branchScopeError, isUuid } from "@/lib/online-orders/rules";
import type { OnlineOrderStatus, OnlineOrderView } from "@/lib/online-orders/types";
import { DEFAULT_TEMPLATES, type TemplateKey } from "@/lib/online-orders/whatsapp";

export type PosOnlineOrder = {
  orderId: string;
  number: string;
  branchId: string;
  holdLive: boolean;
  customer: { name: string; phone: string; email: string | null; document: string | null };
  matchedCustomerId: string | null;
  matchedCustomer: { id: string; name: string; document: string | null; segment: string } | null;
  lines: {
    variantId: string;
    quantity: number;
    unitPrice: number;
    productName: string;
    variantLabel: string;
    sku: string;
  }[];
};

async function requireSalesView() {
  const session = await getSession();
  if (!session || !canView(session.permissions, "Ventas")) {
    throw new Error("No autorizado para ver pedidos online.");
  }
  return session;
}

async function hydrateOrders(rows: VOnlineOrderRow[]): Promise<OnlineOrderView[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const items = await inChunks(rows.map((row) => row.id), async (ids) => {
    const { data, error } = await supabase.from("online_order_items").select("*")
      .in("order_id", ids).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }, 40);
  const branchIds = [...new Set(items.map((item) => item.branch_id))];
  const saleIds = [...new Set(items.flatMap((item) => item.sale_id ? [item.sale_id] : []))];
  const [branches, sales] = await Promise.all([
    inChunks(branchIds, async (ids) => {
      const { data, error } = await supabase.from("branches").select("id, name").in("id", ids);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
    inChunks(saleIds, async (ids) => {
      const { data, error } = await supabase.from("sales").select("id, invoice_number").in("id", ids);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
  ]);
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const invoices = new Map(sales.map((sale) => [sale.id, sale.invoice_number]));
  const byOrder = new Map<string, ItemRow[]>();
  for (const item of items) {
    const group = byOrder.get(item.order_id) ?? [];
    group.push(item);
    byOrder.set(item.order_id, group);
  }
  return rows.map((row) => mapOrderRow(row, byOrder.get(row.id) ?? [], branchNames, invoices));
}

async function branchOrderIds(branchId: string): Promise<string[]> {
  const supabase = await createClient();
  const ids = new Set<string>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from("online_order_items")
      .select("order_id").eq("branch_id", branchId).order("id").range(start, start + 999);
    if (error) throw new Error(error.message);
    for (const item of data ?? []) ids.add(item.order_id);
    if (!data || data.length < 1000) break;
  }
  return [...ids];
}

export async function listOnlineOrders(opts: {
  branchId: string | null;
  status: OnlineOrderStatus | "activas" | "todas";
  q?: string;
  limit?: number;
}): Promise<OnlineOrderView[]> {
  const session = await requireSalesView();
  const branchId = getProfileBranchScope(session.profile) ?? opts.branchId;
  const supabase = await createClient();
  const term = opts.q?.trim().replace(/[^\p{L}\p{N}\s+@_-]/gu, " ").replace(/\s+/g, " ").trim();
  const limit = Math.min(200, Math.max(1, Math.trunc(opts.limit ?? 200) || 200));
  async function fetchRows(ids?: string[], rowLimit = limit): Promise<VOnlineOrderRow[]> {
    let query = supabase.from("v_online_orders").select("*").order("created_at", { ascending: false });
    if (ids) query = query.in("id", ids);
    if (opts.status === "activas") {
      query = query.in("effective_status", ["solicitada", "aceptada", "vencida"])
        .in("status", ["solicitada", "aceptada"]);
    } else if (opts.status !== "todas") {
      query = query.eq("effective_status", opts.status);
    }
    if (term) {
      query = query.or(`number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`);
    }
    const { data, error } = await query.limit(rowLimit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  if (!branchId) return hydrateOrders(await fetchRows());
  if (["activas", "solicitada", "aceptada", "vencida"].includes(opts.status)) {
    const candidates = await fetchRows(undefined, 500);
    const matchingItems = await inChunks(candidates.map((row) => row.id), async (ids) => {
      const { data, error } = await supabase.from("online_order_items")
        .select("order_id").in("order_id", ids).eq("branch_id", branchId);
      if (error) throw new Error(error.message);
      return data ?? [];
    }, 40);
    const matchingIds = new Set(matchingItems.map((item) => item.order_id));
    return hydrateOrders(candidates.filter((row) => matchingIds.has(row.id)).slice(0, limit));
  }
  const ids = await branchOrderIds(branchId);
  const rows = await inChunks(ids, fetchRows);
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return hydrateOrders(rows.slice(0, limit));
}

export async function getOnlineOrder(id: string): Promise<OnlineOrderView | null> {
  const session = await requireSalesView();
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_online_orders").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const assignedBranch = getProfileBranchScope(session.profile);
  if (assignedBranch) {
    const { data: items, error: itemError } = await supabase.from("online_order_items")
      .select("branch_id").eq("order_id", id).eq("branch_id", assignedBranch).limit(1);
    if (itemError) throw new Error(itemError.message);
    if (branchScopeError(assignedBranch, (items ?? []).map((item) => item.branch_id), [])) return null;
  }
  return (await hydrateOrders([data]))[0];
}

export async function countNewOnlineOrders(branchId: string | null): Promise<{
  count: number; latestNumber: string | null; latestAt: string | null;
}> {
  const session = await requireSalesView();
  const effectiveBranchId = getProfileBranchScope(session.profile) ?? branchId;
  const supabase = await createClient();
  if (!effectiveBranchId) {
    const { data, error, count } = await supabase.from("v_online_orders")
      .select("number, created_at", { count: "exact" })
      .eq("effective_status", "solicitada")
      .eq("status", "solicitada")
      .order("created_at", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return { count: count ?? 0, latestNumber: data?.[0]?.number ?? null, latestAt: data?.[0]?.created_at ?? null };
  }

  // Read new orders first, then look for lines in the effective branch.
  const requested = [] as { id: string; number: string; created_at: string }[];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from("v_online_orders")
      .select("id, number, created_at").eq("effective_status", "solicitada")
      .eq("status", "solicitada")
      .order("created_at", { ascending: false }).order("id").range(start, start + 999);
    if (error) throw new Error(error.message);
    requested.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const matchedIds = new Set((await inChunks(requested.map((row) => row.id), async (ids) => {
    const { data, error } = await supabase.from("online_order_items")
      .select("order_id").in("order_id", ids).eq("branch_id", effectiveBranchId);
    if (error) throw new Error(error.message);
    return data ?? [];
  })).map((item) => item.order_id));
  const latest = requested.find((row) => matchedIds.has(row.id));
  return { count: matchedIds.size, latestNumber: latest?.number ?? null, latestAt: latest?.created_at ?? null };
}

export async function getOnlineSettings(): Promise<{
  softHoldMinutes: number;
  firmHoldHours: number;
  storeWhatsapp: string | null;
  templates: Record<TemplateKey, string>;
}> {
  const session = await getSession();
  if (!session || (!canView(session.permissions, "Ventas") && !canEdit(session.permissions, "Configuración"))) {
    throw new Error("No autorizado para ver la configuración de pedidos online.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("online_settings")
    .select("soft_hold_minutes, firm_hold_hours, store_whatsapp, whatsapp_templates")
    .eq("id", 1).single();
  if (error) throw new Error(error.message);
  const templates = { ...DEFAULT_TEMPLATES };
  for (const key of Object.keys(templates) as TemplateKey[]) {
    const value = data.whatsapp_templates[key];
    if (typeof value === "string" && value.trim()) templates[key] = value;
  }
  return {
    softHoldMinutes: Number(data.soft_hold_minutes),
    firmHoldHours: Number(data.firm_hold_hours),
    storeWhatsapp: data.store_whatsapp,
    templates,
  };
}

export async function getOnlineBranches(): Promise<{ id: string; name: string; city: string }[]> {
  await requireSalesView();
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches")
    .select("id, name, city")
    .eq("is_active", true)
    .eq("online_enabled", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getOnlineOrderForPos(orderId: string, branchId: string): Promise<PosOnlineOrder | null> {
  const session = await requireSalesView();
  if (!isUuid(orderId)) return null;
  if (!canEdit(session.permissions, "Ventas")) return null;
  const assignedBranch = getProfileBranchScope(session.profile);
  if (assignedBranch && assignedBranch !== branchId) return null;
  const supabase = await createClient();
  const { data: order, error: orderError } = await supabase.from("v_online_orders")
    .select("id, number, status, customer_name, customer_phone, customer_email, customer_document, firm_expires_at")
    .eq("id", orderId).maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order || order.status !== "aceptada") return null;

  const { data: items, error: itemError } = await supabase.from("online_order_items")
    .select("variant_id, quantity, unit_price, product_name, variant_label, sku")
    .eq("order_id", orderId).eq("branch_id", branchId)
    .is("sale_id", null).is("released_at", null);
  if (itemError) throw new Error(itemError.message);
  if (!items?.length) return null;

  let matchedCustomer: PosOnlineOrder["matchedCustomer"] = null;
  const document = order.customer_document?.trim();
  if (document) {
    const escapedDocument = document.replace(/[\\%_]/g, "\\$&");
    const { data, error } = await supabase.from("customers").select("id, name, document, segment")
      .eq("branch_id", branchId).ilike("document", escapedDocument).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    matchedCustomer = data ?? null;
  }
  if (!matchedCustomer) {
    const last10 = order.customer_phone.replace(/\D/g, "").slice(-10);
    if (last10.length === 10) {
      // Interleaved wildcards also find formatted numbers; final comparison prevents partial matches.
      const pattern = "%" + last10.split("").join("%") + "%";
      const { data, error } = await supabase.from("customers").select("id, name, document, segment, phone")
        .eq("branch_id", branchId).ilike("phone", pattern).limit(20);
      if (error) throw new Error(error.message);
      const match = data?.find((customer) =>
        customer.phone?.replace(/\D/g, "").slice(-10) === last10);
      matchedCustomer = match ? {
        id: match.id, name: match.name, document: match.document, segment: match.segment,
      } : null;
    }
  }

  return {
    orderId: order.id,
    number: order.number,
    branchId,
    holdLive: !!order.firm_expires_at && new Date(order.firm_expires_at).getTime() > Date.now(),
    customer: {
      name: order.customer_name,
      phone: order.customer_phone,
      email: order.customer_email,
      document: order.customer_document,
    },
    matchedCustomerId: matchedCustomer?.id ?? null,
    matchedCustomer,
    lines: items.map((item) => ({
      variantId: item.variant_id,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      productName: item.product_name,
      variantLabel: item.variant_label,
      sku: item.sku,
    })),
  };
}
