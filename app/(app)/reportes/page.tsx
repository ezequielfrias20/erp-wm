import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getReports } from "@/lib/queries/reports";
import { getActiveBranchId } from "@/lib/branch";
import { canView } from "@/lib/permissions";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { normalizeReportRange } from "@/lib/report-dates";
import { ReportesView } from "@/components/reportes/reportes-view";
import { parsePageRequest } from "@/lib/pagination";

export const metadata = { title: "Reportes · World Medics ERP" };

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; salesPage?: string; salesPageSize?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Reportes")) redirect("/dashboard");

  const sp = await searchParams;
  const { from, to } = normalizeReportRange(sp);
  const salesPaging = parsePageRequest({
    page: sp.salesPage,
    pageSize: sp.salesPageSize,
  });

  const branchId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );
  const supabase = await createClient();

  const [bcv, settingsRes] = await Promise.all([
    fetchBcvRate().catch(() => ({ rate: BCV_FALLBACK, updatedAt: "", source: "BCV" })),
    supabase
      .from("settings")
      .select("company_name, rif, fiscal_address, phone, logo_url")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const data = await getReports(
    branchId,
    from,
    to,
    bcv.rate,
    salesPaging.page,
    salesPaging.pageSize,
  );

  let branchLabel = "Todas";
  if (branchId) {
    const { data: b } = await supabase
      .from("branches")
      .select("city")
      .eq("id", branchId)
      .maybeSingle();
    if (b) branchLabel = b.city;
  }

  const s = settingsRes.data;
  return (
    <ReportesView
      data={data}
      branchLabel={branchLabel}
      company={{
        name: s?.company_name ?? null,
        rif: s?.rif ?? null,
        address: s?.fiscal_address ?? null,
        phone: s?.phone ?? null,
        logoUrl: s?.logo_url ?? null,
      }}
    />
  );
}
