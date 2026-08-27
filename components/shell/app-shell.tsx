"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import type { ShellSummary } from "@/components/shell/shell-data";
import type { BcvRate } from "@/lib/bcv";
import { ModuleLoading } from "@/components/ui/module-loading";

export function AppShell({
  bcv,
  shell,
  logoUrl,
  logoDarkUrl,
  companyName,
  children,
}: {
  bcv: BcvRate;
  /** Promesa: el shell pinta sin esperar los conteos ni las notificaciones. */
  shell: Promise<ShellSummary>;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  companyName: string | null;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const timer = window.setTimeout(() => setNavigatingTo(null), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!navigatingTo) return;
    const timer = window.setTimeout(() => setNavigatingTo(null), 15_000);
    return () => window.clearTimeout(timer);
  }, [navigatingTo]);

  function beginNavigation(href: string) {
    setNavigatingTo(href);
    setMobileOpen(false);
  }

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
          shell={shell}
          bcv={bcv}
          logoUrl={logoUrl}
          logoDarkUrl={logoDarkUrl}
          companyName={companyName}
          onNavigate={beginNavigation}
          className="h-full w-full shadow-card-lg"
          width="100%"
        />
      </div>
      <Sidebar
        collapsed={collapsed}
        shell={shell}
        bcv={bcv}
        logoUrl={logoUrl}
        logoDarkUrl={logoDarkUrl}
        companyName={companyName}
        onNavigate={beginNavigation}
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
          shell={shell}
        />
        <main
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background"
          aria-busy={Boolean(navigatingTo)}
        >
          {children}
          {navigatingTo ? <ModuleLoading overlay /> : null}
        </main>
      </div>
    </div>
  );
}
