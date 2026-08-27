"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function useServerTable(prefix = "") {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [pending, startTransition] = useTransition();
  const key = (name: string) => `${prefix}${name}`;

  function update(values: Record<string, string | number | null>) {
    const params = new URLSearchParams(current.toString());
    for (const [name, value] of Object.entries(values)) {
      const param = key(name);
      if (value == null || value === "") params.delete(param);
      else params.set(param, String(value));
    }
    startTransition(() => router.replace(`${pathname}?${params}`, { scroll: false }));
  }

  return { pending, update };
}
