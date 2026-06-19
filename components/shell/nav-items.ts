import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Shirt,
  Users,
  Store,
  Shield,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { ModuleName } from "@/lib/database.types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  module: ModuleName;
  badgeKey?: "lowStock";
};

export type NavSection = { label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "Dashboard" },
      { href: "/ventas", label: "Ventas", icon: ShoppingCart, module: "Ventas" },
      { href: "/inventario", label: "Inventario", icon: Boxes, module: "Inventario", badgeKey: "lowStock" },
      { href: "/productos", label: "Productos", icon: Shirt, module: "Productos" },
      { href: "/clientes", label: "Clientes", icon: Users, module: "Clientes" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/sucursales", label: "Sucursales", icon: Store, module: "Sucursales" },
      { href: "/usuarios", label: "Usuarios", icon: Shield, module: "Usuarios" },
      { href: "/reportes", label: "Reportes", icon: BarChart3, module: "Reportes" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/configuracion", label: "Configuración", icon: Settings, module: "Configuración" },
    ],
  },
];
