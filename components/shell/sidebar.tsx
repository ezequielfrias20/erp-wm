"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { BrandMark } from "@/components/shell/brand-mark";
import { NAV_SECTIONS } from "@/components/shell/nav-items";
import { useCan } from "@/context/session";
import { fmtVES } from "@/lib/format";
import type { BcvRate } from "@/lib/bcv";

export function Sidebar({
  collapsed,
  badges,
  bcv,
  logoUrl,
  logoDarkUrl,
  companyName,
}: {
  collapsed: boolean;
  badges: { lowStock?: number };
  bcv: BcvRate;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  companyName: string | null;
}) {
  const pathname = usePathname();
  const { view } = useCan();
  const expanded = !collapsed;

  return (
    <aside
      data-collapsed={collapsed}
      className="relative flex flex-none flex-col border-r border-border bg-sidebar transition-[width] duration-200"
      style={{ width: collapsed ? 76 : 262 }}
    >
      <div className="flex h-16 flex-none items-center border-b border-border px-4">
        <BrandMark
          variant="sidebar"
          collapsed={collapsed}
          logoUrl={logoUrl}
          logoDarkUrl={logoDarkUrl}
          companyName={companyName}
        />
      </div>

      <nav className="flex-1 overflow-x-hidden overflow-y-auto py-[14px]">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((i) => view(i.module));
          if (items.length === 0) return null;
          return (
            <div key={section.label}>
              {expanded && (
                <div className="px-[26px] pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.09em] text-text-3 uppercase">
                  {section.label}
                </div>
              )}
              {items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                const badge =
                  item.badgeKey === "lowStock" ? badges.lowStock : undefined;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-active={active}
                    title={collapsed ? item.label : undefined}
                    className="nav-item mx-3 my-0.5 flex items-center gap-3 rounded-[10px] px-[14px] py-[9px] text-[13.5px] font-medium whitespace-nowrap text-text-2"
                  >
                    <Icon className="size-5 flex-none" strokeWidth={1.8} />
                    {expanded && <span className="flex-1">{item.label}</span>}
                    {expanded && badge ? (
                      <span className="flex-none rounded-full bg-warning-soft px-[7px] py-px text-[10.5px] font-bold text-warning">
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {expanded && (
        <div className="m-3 flex-none rounded-xl border border-border bg-surface-2 p-[14px]">
          <div className="mb-2 flex items-center gap-2">
            <RefreshCw className="size-[18px] text-brand" />
            <span className="text-[12px] font-semibold text-foreground">
              Tasa BCV
            </span>
          </div>
          <div className="text-[18px] font-bold tracking-tight text-foreground">
            {fmtVES(bcv.rate)}
          </div>
          <div className="mt-0.5 text-[11px] text-text-3">por 1 USD · oficial</div>
        </div>
      )}
    </aside>
  );
}
