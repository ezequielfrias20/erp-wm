import { redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { getShellData } from "@/lib/queries/shell";
import { getActiveBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { fetchBcvRate, BCV_FALLBACK, type BcvRate } from "@/lib/bcv";
import { SessionProvider } from "@/context/session";
import { BranchProvider, type BranchOption } from "@/context/branch";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const activeId = await getActiveBranchId();

  const [branchesRes, bcv] = await Promise.all([
    supabase
      .from("branches")
      .select("id, code, city, name, color")
      .eq("is_active", true)
      .order("code"),
    fetchBcvRate().catch(
      (): BcvRate => ({
        rate: BCV_FALLBACK,
        updatedAt: new Date().toISOString(),
        source: "BCV",
      }),
    ),
  ]);

  const branches = (branchesRes.data ?? []) as BranchOption[];
  const shell = await getShellData(bcv, activeId);

  return (
    <SessionProvider value={session}>
      <BranchProvider branches={branches} activeId={activeId}>
        <AppShell
          bcv={bcv}
          badges={{ lowStock: shell.lowStock }}
          notifications={shell.notifications}
        >
          {children}
        </AppShell>
      </BranchProvider>
    </SessionProvider>
  );
}
