import { redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { getShellData } from "@/lib/queries/shell";
import { getBranding } from "@/lib/queries/branding";
import { getActiveBranchId, getProfileBranchScope } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { fetchBcvRate, BCV_FALLBACK, type BcvRate } from "@/lib/bcv";
import { SessionProvider } from "@/context/session";
import { BranchProvider, type BranchOption } from "@/context/branch";
import { AppShell } from "@/components/shell/app-shell";
import { EMPTY_SHELL_SUMMARY } from "@/components/shell/shell-data";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const assignedBranchId = getProfileBranchScope(session.profile);
  const activeId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );
  const branchesQuery = supabase
    .from("branches")
    .select("id, code, city, name, color")
    .order("code");
  const scopedBranchesQuery = assignedBranchId
    ? branchesQuery.eq("id", assignedBranchId)
    : branchesQuery.eq("is_active", true);

  const bcvPromise = fetchBcvRate().catch(
    (): BcvRate => ({
      rate: BCV_FALLBACK,
      updatedAt: new Date().toISOString(),
      source: "BCV",
    }),
  );

  // Los badges del sidebar y las notificaciones del header no bloquean el shell:
  // viajan como promesa y se resuelven dentro de su propio Suspense. Antes el
  // layout entero esperaba estos conteos (~0.7 s medidos) antes de pintar nada.
  const shellPromise = bcvPromise
    .then((bcv) => getShellData(bcv, activeId))
    .catch(() => EMPTY_SHELL_SUMMARY);

  const [branchesRes, bcv, branding] = await Promise.all([
    scopedBranchesQuery,
    bcvPromise,
    getBranding(),
  ]);

  const branches = (branchesRes.data ?? []) as BranchOption[];

  return (
    <SessionProvider value={session}>
      <BranchProvider
        branches={branches}
        activeId={activeId}
        locked={Boolean(assignedBranchId)}
      >
        <AppShell
          bcv={bcv}
          shell={shellPromise}
          logoUrl={branding.logoUrl}
          logoDarkUrl={branding.logoDarkUrl}
          companyName={branding.companyName}
        >
          {children}
        </AppShell>
      </BranchProvider>
    </SessionProvider>
  );
}
