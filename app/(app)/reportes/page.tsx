import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getReports } from "@/lib/queries/reports";
import { getActiveBranchId } from "@/lib/branch";
import { canView } from "@/lib/permissions";
import { ReportesView } from "@/components/reportes/reportes-view";

export const metadata = { title: "Reportes · World Medics ERP" };

export default async function ReportesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Reportes")) redirect("/dashboard");

  const branchId = await getActiveBranchId();
  const data = await getReports(branchId);

  let branchLabel = "Todas";
  if (branchId) {
    const supabase = await createClient();
    const { data: b } = await supabase
      .from("branches")
      .select("city")
      .eq("id", branchId)
      .maybeSingle();
    if (b) branchLabel = b.city;
  }

  return <ReportesView data={data} branchLabel={branchLabel} />;
}
