import type { ModuleName } from "@/lib/database.types";
import type { PermissionMap } from "@/lib/queries/session";

/** 0 = sin acceso, 1 = ver, 2 = control total. */
export function canView(perms: PermissionMap, module: ModuleName): boolean {
  return (perms[module] ?? 0) >= 1;
}

export function canEdit(perms: PermissionMap, module: ModuleName): boolean {
  return (perms[module] ?? 0) >= 2;
}

export function permissionLabel(level: number): string {
  if (level >= 2) return "Control total";
  if (level === 1) return "Solo lectura";
  return "Sin acceso";
}
