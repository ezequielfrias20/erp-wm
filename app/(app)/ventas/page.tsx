import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getActiveBranchId } from "@/lib/branch";
import { canView } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { PosView, type PosProduct } from "@/components/ventas/pos-view";

export const metadata = { title: "Punto de venta · World Medics ERP" };

export default async function VentasPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Ventas")) redirect("/dashboard");

  const supabase = await createClient();
  const activeBranchId = await getActiveBranchId();

  // POS works on a concrete branch: active filter -> user's home branch -> first branch.
  let branchId = activeBranchId ?? session.profile.branch_id;
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

  const [branchRes, invRes, customersRes, pmRes, settingsRes, bcv] = await Promise.all([
    branchId
      ? supabase.from("branches").select("id, city").eq("id", branchId).maybeSingle()
      : Promise.resolve({ data: null }),
    branchId
      ? supabase
          .from("v_inventory")
          .select(
            "variant_id, sku, product_name, category, price, cost, color, color_hex, size, quantity",
          )
          .eq("branch_id", branchId)
          .gt("quantity", 0)
          .order("product_name")
      : Promise.resolve({ data: [] }),
    supabase
      .from("customers")
      .select("id, name, document, segment")
      .order("name"),
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
  ]);

  const products: PosProduct[] = (invRes.data ?? []).map((r) => ({
    variant_id: r.variant_id,
    sku: r.sku,
    product_name: r.product_name,
    category: r.category,
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
