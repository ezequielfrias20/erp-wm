"use client";

import { createContext, useContext } from "react";
import type { ModuleName, Profile } from "@/lib/database.types";
import type { PermissionMap } from "@/lib/queries/session";
import { canEdit, canView } from "@/lib/permissions";

type SessionValue = { profile: Profile; permissions: PermissionMap };

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de SessionProvider");
  return ctx;
}

export function useCan() {
  const { permissions } = useSession();
  return {
    view: (m: ModuleName) => canView(permissions, m),
    edit: (m: ModuleName) => canEdit(permissions, m),
  };
}
