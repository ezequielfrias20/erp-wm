"use client";

import {
  Menu,
  Search,
  Store,
  ChevronDown,
  Bell,
  Check,
  AlertTriangle,
  ShoppingCart,
  Truck,
  RefreshCw,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { useBranch } from "@/context/branch";
import { useSession } from "@/context/session";
import { signOut } from "@/app/(auth)/actions";
import { fmtVES, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BcvRate } from "@/lib/bcv";
import Link from "next/link";

export type ShellNotification = {
  id: string;
  icon: "alert" | "cart" | "truck" | "refresh";
  title: string;
  body: string;
  time: string;
  tone: "danger" | "brand" | "success" | "muted";
};

const NOTIF_ICON = {
  alert: AlertTriangle,
  cart: ShoppingCart,
  truck: Truck,
  refresh: RefreshCw,
};

const TONE: Record<string, { bg: string; color: string }> = {
  danger: { bg: "var(--danger-soft)", color: "var(--danger)" },
  brand: { bg: "var(--brand-soft)", color: "var(--brand)" },
  success: { bg: "var(--success-soft)", color: "var(--success)" },
  muted: { bg: "var(--surface-2)", color: "var(--text-2)" },
};

export function Header({
  onToggleSidebar,
  bcv,
  notifications,
}: {
  onToggleSidebar: () => void;
  bcv: BcvRate;
  notifications: ShellNotification[];
}) {
  const { branches, activeId, label, setBranch } = useBranch();
  const { profile } = useSession();

  return (
    <header className="bg-glass relative z-40 flex h-16 flex-none items-center gap-[14px] border-b border-border px-[22px] backdrop-blur-[14px]">
      <button
        type="button"
        aria-label="Contraer menú"
        onClick={onToggleSidebar}
        className="iconbtn flex size-[38px] flex-none items-center justify-center rounded-[9px] text-text-2"
      >
        <Menu className="size-5" />
      </button>

      <div className="relative w-[340px] max-w-[32vw]">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-text-3" />
        <input
          placeholder="Buscar productos, clientes, facturas…"
          className="h-[38px] w-full rounded-[10px] border border-border bg-surface-2 pr-11 pl-[37px] text-[13px] text-foreground outline-none"
        />
        <span className="absolute top-1/2 right-[9px] -translate-y-1/2 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10.5px] font-semibold text-text-3">
          ⌘K
        </span>
      </div>

      <div className="flex-1" />

      {/* Branch switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="iconbtn flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-card px-[11px] text-[13px] font-medium text-foreground">
            <Store className="size-[17px] text-brand" />
            <span className="max-w-[160px] truncate">{label}</span>
            <ChevronDown className="size-[15px] text-text-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[248px]">
          <DropdownMenuLabel className="text-[10.5px] font-bold tracking-[0.07em] text-text-3 uppercase">
            Sucursal activa
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setBranch("all")} className="gap-2.5">
            <span className="size-2 rounded-full bg-text-3" />
            <span className="flex-1 text-[13px]">Todas las sucursales</span>
            {!activeId && <Check className="size-4 text-brand" />}
          </DropdownMenuItem>
          {branches.map((b) => (
            <DropdownMenuItem
              key={b.id}
              onClick={() => setBranch(b.id)}
              className="gap-2.5"
            >
              <span
                className="size-2 rounded-full"
                style={{ background: b.color ?? "var(--brand)" }}
              />
              <span className="flex-1 text-[13px]">{b.city}</span>
              {activeId === b.id && <Check className="size-4 text-brand" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* BCV pill */}
      <div className="flex h-[38px] items-center gap-[9px] rounded-[10px] border border-border bg-surface-2 px-3">
        <span className="text-[11px] font-bold tracking-wide text-brand">USD</span>
        <span className="h-4 w-px bg-border" />
        <div className="flex flex-col gap-px leading-[1.15]">
          <span className="text-[11.5px] font-semibold text-foreground">
            {fmtVES(bcv.rate)}
          </span>
          <span className="text-[9px] tracking-wider text-text-3">TASA BCV</span>
        </div>
      </div>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="iconbtn relative flex size-[38px] flex-none items-center justify-center rounded-[10px] border border-border bg-card text-text-2">
            <Bell className="size-[18px]" />
            {notifications.length > 0 && (
              <span className="absolute top-[7px] right-2 size-[7px] rounded-full border-2 border-card bg-danger" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[340px] p-0">
          <div className="flex items-center justify-between border-b border-border px-[15px] py-[13px]">
            <span className="text-[13.5px] font-bold text-foreground">
              Notificaciones
            </span>
            <span className="text-[11.5px] font-medium text-brand">
              Marcar leídas
            </span>
          </div>
          {notifications.map((n) => {
            const Icon = NOTIF_ICON[n.icon];
            const tone = TONE[n.tone];
            return (
              <div
                key={n.id}
                className="tr-row flex gap-[11px] border-b border-border px-[15px] py-3"
              >
                <span
                  className="flex size-8 flex-none items-center justify-center rounded-[9px]"
                  style={{ background: tone.bg, color: tone.color }}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-foreground">
                    {n.title}
                  </div>
                  <div className="mt-px text-[12px] text-text-2">{n.body}</div>
                  <div className="mt-0.5 text-[11px] text-text-3">{n.time}</div>
                </div>
              </div>
            );
          })}
          <div className="px-[15px] py-[11px] text-center text-[12.5px] font-medium text-brand">
            Ver todas
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <ThemeToggle />

      {/* Profile */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="iconbtn flex h-[38px] items-center gap-[9px] rounded-full border border-border bg-card py-[3px] pr-[9px] pl-1">
            <span
              className="flex size-[30px] flex-none items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{ background: "linear-gradient(140deg,#6366F1,#0EA5E9)" }}
            >
              {initials(profile.full_name)}
            </span>
            <div className="flex flex-col text-left leading-[1.15]">
              <span className="text-[12.5px] font-semibold whitespace-nowrap text-foreground">
                {profile.full_name}
              </span>
              <span className="text-[10.5px] whitespace-nowrap text-text-3">
                {profile.role}
              </span>
            </div>
            <ChevronDown className="size-[15px] text-text-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[230px]">
          <div className="flex items-center gap-2.5 p-2.5">
            <span
              className="flex size-[38px] flex-none items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: "linear-gradient(140deg,#6366F1,#0EA5E9)" }}
            >
              {initials(profile.full_name)}
            </span>
            <div className="leading-[1.2]">
              <div className="text-[13px] font-semibold text-foreground">
                {profile.full_name}
              </div>
              <div className="text-[11.5px] text-text-3">{profile.email}</div>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/configuracion">
              <User className="size-[17px] text-text-3" /> Mi perfil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/configuracion">
              <Settings className="size-[17px] text-text-3" /> Configuración
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void signOut()}
            className={cn("text-danger")}
          >
            <LogOut className="size-[17px]" /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
