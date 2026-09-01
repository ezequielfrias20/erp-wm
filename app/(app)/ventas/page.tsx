import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId, getProfileBranchScope } from "@/lib/branch";
import { canView } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { PosView, type PosProduct } from "@/components/ventas/pos-view";
import { productImageUrl } from "@/lib/product-images";

export const metadata = { title: "Punto de venta · World Medics ERP" };

export default async function VentasPage() {
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
  };

  let customersQ = supabase
    .from("customers")
    .select("id, name, document, segment")
    .order("name");
  if (branchId) customersQ = customersQ.eq("branch_id", branchId);

  // `sellers` y las versiones de producto iban en serie después de este Promise.all
  // (dos viajes encadenados de más). Ninguna depende del resto: se traen aquí.
  const [
    branchRes,
    invRows,
    customersRes,
    pmRes,
    settingsRes,
    bcv,
    sellersRes,
    productVersionsRes,
  ] = await Promise.all([
    branchId
      ? supabase.from("branches").select("id, city").eq("id", branchId).maybeSingle()
      : Promise.resolve({ data: null }),
    branchId
      ? fetchAllRows<PosInventoryRow>((from, to) =>
          supabase
            .from("v_inventory")
            .select(
              "product_id, variant_id, sku, product_name, category, brand, price, cost, color, color_hex, size, quantity",
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
    supabase.from("products").select("id, updated_at"),
  ]);

  const sellers = sellersRes.data;
  const versionByProduct = new Map(
    (productVersionsRes.data ?? []).map((product) => [product.id, product.updated_at]),
  );

  const products: PosProduct[] = invRows.map((r) => ({
    product_id: r.product_id,
    variant_id: r.variant_id,
    product_image_url: productImageUrl(r.product_id, versionByProduct.get(r.product_id)),
    sku: r.sku,
    product_name: r.product_name,
    category: r.category,
    brand: r.brand,
    price: r.price,
    cost: r.cost,
    color: r.color,
    color_hex: r.color_hex,
    size: r.size,
    stock: r.quantity,
  }));

  const s = settingsRes.data;
  return (
    <PosView
      products={products}
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
  );
}
