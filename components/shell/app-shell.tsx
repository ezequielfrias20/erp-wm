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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-50 bg-black/45 lg:hidden"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[min(86vw,304px)] transform transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          collapsed={false}
          badges={badges}
          bcv={bcv}
          logoUrl={logoUrl}
          logoDarkUrl={logoDarkUrl}
          companyName={companyName}
          onNavigate={() => setMobileOpen(false)}
          className="h-full w-full shadow-card-lg"
          width="100%"
        />
      </div>
      <Sidebar
        collapsed={collapsed}
        badges={badges}
        bcv={bcv}
        logoUrl={logoUrl}
        logoDarkUrl={logoDarkUrl}
        companyName={companyName}
        className="hidden lg:flex"
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          onToggleSidebar={() => {
            if (window.matchMedia("(min-width: 1024px)").matches) {
              setCollapsed((c) => !c);
            } else {
              setMobileOpen(true);
            }
          }}
          bcv={bcv}
          notifications={notifications}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
