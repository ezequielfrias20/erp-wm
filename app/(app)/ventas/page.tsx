import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId, getProfileBranchScope } from "@/lib/branch";
import { canEdit, canView } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { PosView, type PosProduct } from "@/components/ventas/pos-view";
import { getMainPhotoUrls } from "@/lib/queries/catalog";
import { sellableStock } from "@/lib/sales/stock";
import { getOnlineOrderForPos } from "@/lib/queries/online-orders";
import { stockWithOwnHold } from "@/lib/online-orders/pos";
import { isUuid } from "@/lib/online-orders/rules";
import type { CompletedOnlineOrder } from "@/components/ventas/online-order-banner";

export const metadata = { title: "Punto de venta" };

export default async function VentasPage({ searchParams }: {
  searchParams: Promise<{ pedido?: string; convertido?: string; factura?: string; numero?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Ventas")) redirect("/dashboard");

  const supabase = await createClient();
  const activeBranchId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );
  const assignedBranchId = getProfileBranchScope(session.profile);

  // POS works on a concrete branch: active filter -> user's home branch -> first branch.
  let branchId = activeBranchId ?? assignedBranchId;
  if (!branchId) {
    const { data: first } = await supabase
      .from("branches")
      .select("id")
      .eq("is_active", true)
      .order("code")
      .limit(1)
      .maybeSingle();
    branchId = first?.id ?? null;
  }
  const { pedido, convertido, factura, numero } = await searchParams;
  const onlineOrder = pedido && branchId
    ? await getOnlineOrderForPos(pedido, branchId).catch(() => null)
    : null;
  const initialCompletedOrder: CompletedOnlineOrder | null =
    !pedido && isUuid(convertido) && typeof factura === "string" && /^FAC-\d+$/.test(factura)
      && typeof numero === "string" && /^W-\d{6,}$/.test(numero)
      ? { orderId: convertido, number: numero, invoice: factura }
      : null;

  type PosInventoryRow = {
    product_id: string;
    variant_id: string;
    sku: string;
    product_name: string;
    category: string | null;
    brand: string | null;
    price: number;
    cost: number;
    color: string | null;
    color_hex: string | null;
    size: string | null;
    quantity: number;
    online_held: number;
  };

  let customersQ = supabase
    .from("customers")
    .select("id, name, document, segment")
    .order("name");
  if (branchId) customersQ = customersQ.eq("branch_id", branchId);

  // Los vendedores no dependen de las existencias y se cargan en paralelo.
  const [
    branchRes,
    invRows,
    customersRes,
    pmRes,
    settingsRes,
    bcv,
    sellersRes,
    mainPhotoUrls,
    aliases,
  ] = await Promise.all([
    branchId
      ? supabase.from("branches").select("id, city").eq("id", branchId).maybeSingle()
      : Promise.resolve({ data: null }),
    branchId
      ? fetchAllRows<PosInventoryRow>((from, to) =>
          supabase
            .from("v_inventory")
            .select(
              "product_id, variant_id, sku, product_name, category, brand, price, cost, color, color_hex, size, quantity, online_held",
            )
            .eq("branch_id", branchId)
            .gt("quantity", 0)
            .order("product_name")
            .range(from, to),
        )
      : Promise.resolve([]),
    customersQ,
    supabase
      .from("payment_methods")
      .select("name, currency, requires_reference, is_financed")
      .eq("enabled", true)
      .order("sort_order"),
    supabase
      .from("settings")
      .select("company_name, rif, fiscal_address, phone, logo_url")
      .eq("id", 1)
      .maybeSingle(),
    fetchBcvRate().catch(() => ({
      rate: BCV_FALLBACK,
      updatedAt: "",
      source: "BCV",
    })),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "Vendedor")
      .eq("status", "Activo")
      .order("full_name"),
    getMainPhotoUrls(),
    fetchAllRows<{ variant_id: string; sku: string }>((from, to) =>
      supabase.from("variant_sku_aliases").select("variant_id, sku").order("sku").range(from, to),
    ),
  ]);

  const sellers = sellersRes.data;
  const loadedVariantIds = new Set(invRows.map((row) => row.variant_id));
  const aliasesByVariant = new Map<string, string[]>();
  for (const alias of aliases) {
    if (!loadedVariantIds.has(alias.variant_id)) continue;
    const list = aliasesByVariant.get(alias.variant_id) ?? [];
    list.push(alias.sku);
    aliasesByVariant.set(alias.variant_id, list);
  }

  const products: PosProduct[] = invRows.map((r) => ({
    product_id: r.product_id,
    variant_id: r.variant_id,
    product_image_url: mainPhotoUrls.get(r.product_id) ?? null,
    sku: r.sku,
    aliases: aliasesByVariant.get(r.variant_id) ?? [],
    product_name: r.product_name,
    category: r.category,
    brand: r.brand,
    price: r.price,
    cost: r.cost,
    color: r.color,
    color_hex: r.color_hex,
    size: r.size,
    stock: sellableStock(r.quantity, r.online_held),
    online_held: r.online_held,
  }));

  const s = settingsRes.data;
  return (
    <>
      <PosView
        key={isUuid(pedido) && branchId ? `${branchId}:${pedido}` : "normal"}
        products={onlineOrder ? stockWithOwnHold(products, onlineOrder) : products}
        onlineOrder={onlineOrder}
        missingOnlineOrder={Boolean(pedido && !onlineOrder)}
        canConvertOnlineOrder={canEdit(session.permissions, "Ventas")}
        initialCompletedOrder={initialCompletedOrder}
        customers={customersRes.data ?? []}
        paymentMethods={(pmRes.data ?? []).map((p) => ({
          name: p.name,
          currency: (p.currency ?? "VES") as "USD" | "VES",
          requires_reference: !!p.requires_reference,
          is_financed: !!p.is_financed,
        }))}
        branch={branchRes.data ?? null}
        sellers={(sellers ?? []).map((s) => ({
          id: s.id,
          full_name: s.full_name,
        }))}
        rate={bcv.rate}
        company={{
          name: s?.company_name ?? null,
          rif: s?.rif ?? null,
          address: s?.fiscal_address ?? null,
          phone: s?.phone ?? null,
          logoUrl: s?.logo_url ?? null,
        }}
        cashier={session.profile.full_name ?? null}
      />
    </>
  );
}
