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
  setBranch: (id: string) => void;
  pending: boolean;
};

const BranchContext = createContext<BranchValue | null>(null);

export function BranchProvider({
  branches,
  activeId,
  children,
}: {
  branches: BranchOption[];
  activeId: string | null;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const active = activeId
    ? (branches.find((b) => b.id === activeId) ?? null)
    : null;

  const setBranch = (id: string) => {
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
