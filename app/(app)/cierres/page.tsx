import { redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { getActiveBranchId, getProfileBranchScope } from "@/lib/branch";
import { canEdit, canView } from "@/lib/permissions";
import { parseReportDate, reportYmdFromDate } from "@/lib/report-dates";
import type { DailyClosure, DailyClosureSnapshot } from "@/lib/database.types";
import { DailyClosuresView } from "@/components/cierres/daily-closures-view";

export const metadata = { title: "Cierres diarios · World Medics ERP" };

export default async function DailyClosuresPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Ventas")) redirect("/dashboard");

  const supabase = await createClient();
  const sp = await searchParams;
  const today = reportYmdFromDate();
  const date = parseReportDate(sp.date) && sp.date! <= today ? sp.date! : today;
  const assignedBranchId = getProfileBranchScope(session.profile);
  const activeBranchId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );
  let branchesQuery = supabase.from("branches").select("id, name, city, code").order("code");
  if (session.profile.role !== "Super Admin") {
    branchesQuery = branchesQuery.eq("id", assignedBranchId ?? "00000000-0000-0000-0000-000000000000");
  }
  const [branchesRes, settingsRes] = await Promise.all([
    branchesQuery,
    supabase.from("settings")
      .select("company_name, rif, fiscal_address, phone, logo_url")
      .eq("id", 1).maybeSingle(),
  ]);
  const branches = branchesRes.data ?? [];
  const preferredId = assignedBranchId ?? sp.branch ?? activeBranchId;
  const branch = branches.find((item) => item.id === preferredId) ?? branches[0] ?? null;

  let closure: DailyClosure | null = null;
  let preview: DailyClosureSnapshot | null = null;
  let history: DailyClosure[] = [];
  let loadError: string | null = branchesRes.error?.message ?? null;
  if (branch && !loadError) {
    const [closureRes, historyRes] = await Promise.all([
      supabase.from("daily_closures").select("*")
        .eq("branch_id", branch.id).eq("business_date", date).maybeSingle(),
      supabase.from("daily_closures").select("*")
        .eq("branch_id", branch.id)
        .order("business_date", { ascending: false }).limit(60),
    ]);
    loadError = closureRes.error?.message ?? historyRes.error?.message ?? null;
    closure = closureRes.data;
    history = historyRes.data ?? [];
    if (!closure && !loadError) {
      const previewRes = await supabase.rpc("daily_closure_preview", {
        p_branch_id: branch.id,
        p_date: date,
      });
      loadError = previewRes.error?.message ?? null;
      preview = previewRes.data;
    }
  }

  const s = settingsRes.data;
  return (
    <DailyClosuresView
      key={`${branch?.id ?? "none"}:${date}`}
      branches={branches}
      branch={branch}
      date={date}
      today={today}
      preview={preview}
      closure={closure}
      history={history}
      loadError={loadError}
      canSave={canEdit(session.permissions, "Ventas")}
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
