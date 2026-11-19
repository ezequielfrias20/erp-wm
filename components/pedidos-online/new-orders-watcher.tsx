"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useBranch } from "@/context/branch";
import { shouldNotify } from "@/lib/online-orders/rules";

type OrderSummary = {
  count: number;
  latestNumber: string | null;
  latestAt: string | null;
};

export function NewOrdersWatcher() {
  const router = useRouter();
  const { activeId } = useBranch();

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let hasBaseline = false;
    let previousAt: string | null = null;
    let previousCount: number | null = null;

    async function poll() {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/pedidos-online/resumen", {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return;
        const summary = (await response.json()) as OrderSummary;
        if (disposed) return;

        // La primera respuesta sólo establece la referencia. Una referencia
        // vacía sí debe avisar cuando después llegue el primer pedido.
        const newOrder = hasBaseline && summary.latestAt !== null
          && (previousAt === null || shouldNotify(previousAt, summary.latestAt));
        if (newOrder) {
          toast(`Nueva solicitud online ${summary.latestNumber ?? ""}`.trim(), {
            action: {
              label: "Ver",
              onClick: () => {
                router.push("/pedidos-online");
                router.refresh();
              },
            },
          });
        }
        if (previousCount !== summary.count) router.refresh();
        previousCount = summary.count;
        previousAt = summary.latestAt;
        hasBaseline = true;
      } catch {
        // La siguiente consulta reintenta sin interrumpir el uso de la app.
      } finally {
        inFlight = false;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void poll();
    }

    void poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, 60_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeId, router]);

  return null;
}
