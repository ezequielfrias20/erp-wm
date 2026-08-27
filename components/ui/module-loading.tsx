import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function ModuleLoading({ overlay = false }: { overlay?: boolean }) {
  if (overlay) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Cargando módulo"
        className="absolute inset-0 z-40 flex items-center justify-center bg-background/75 backdrop-blur-[2px]"
      >
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-card-lg">
          <Loader2 className="size-5 animate-spin text-brand" />
          Cargando información…
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="space-y-6 p-4 sm:p-6 lg:p-8">
      <span className="sr-only">Cargando información…</span>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-[70vw]" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <Skeleton className="mb-5 h-10 w-full" />
        <div className="space-y-3">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
