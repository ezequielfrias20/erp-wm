"use client";

import { useState } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Header, type ShellNotification } from "@/components/shell/header";
import type { BcvRate } from "@/lib/bcv";

export function AppShell({
  bcv,
  badges,
  notifications,
  logoUrl,
  logoDarkUrl,
  companyName,
  children,
}: {
  bcv: BcvRate;
  badges: { lowStock?: number };
  notifications: ShellNotification[];
  logoUrl: string | null;
  logoDarkUrl: string | null;
  companyName: string | null;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar
        collapsed={collapsed}
        badges={badges}
        bcv={bcv}
        logoUrl={logoUrl}
        logoDarkUrl={logoDarkUrl}
        companyName={companyName}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          onToggleSidebar={() => setCollapsed((c) => !c)}
          bcv={bcv}
          notifications={notifications}
        />
        <main className="min-h-0 flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
