"use client";

import { createContext, useContext, useTransition } from "react";
import { setActiveBranch } from "@/lib/branch-actions";

export type BranchOption = {
  id: string;
  code: string;
  city: string;
  name: string;
  color: string | null;
};

type BranchValue = {
  branches: BranchOption[];
  activeId: string | null;
  active: BranchOption | null;
  label: string;
  locked: boolean;
  setBranch: (id: string) => void;
  pending: boolean;
};

const BranchContext = createContext<BranchValue | null>(null);

export function BranchProvider({
  branches,
  activeId,
  locked = false,
  children,
}: {
  branches: BranchOption[];
  activeId: string | null;
  locked?: boolean;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const active = activeId
    ? (branches.find((b) => b.id === activeId) ?? null)
    : null;

  const setBranch = (id: string) => {
    if (locked) return;
    startTransition(() => {
      void setActiveBranch(id);
    });
  };

  return (
    <BranchContext.Provider
      value={{
        branches,
        activeId,
        active,
        label: active ? active.city : "Todas las sucursales",
        locked,
        setBranch,
        pending,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch debe usarse dentro de BranchProvider");
  return ctx;
}
