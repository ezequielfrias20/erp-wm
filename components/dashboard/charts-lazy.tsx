"use client";

import dynamic from "next/dynamic";

/**
 * Recharts son 363 KB sin comprimir. Cargarlo de forma estática obligaba a bajarlo
 * y parsearlo antes de pintar el dashboard, incluso los KPIs que no lo necesitan.
 * Aquí se carga aparte, con un hueco de las mismas dimensiones para que no haya
 * salto de maquetación.
 */

function AreaPlaceholder() {
  return (
    <div
      aria-hidden
      className="h-[220px] w-full animate-pulse rounded-lg bg-surface-2"
    />
  );
}

export const SalesAreaChart = dynamic(
  () => import("@/components/dashboard/charts").then((m) => m.SalesAreaChart),
  { ssr: false, loading: AreaPlaceholder },
);

export const Donut = dynamic(
  () => import("@/components/dashboard/charts").then((m) => m.Donut),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="size-32 animate-pulse rounded-full bg-surface-2"
      />
    ),
  },
);
