"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export function TablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  itemLabel = "registros",
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  itemLabel?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const from = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-[22px] py-3 text-[12px] text-text-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        Mostrando{" "}
        <strong className="text-foreground">
          {from}-{to}
        </strong>{" "}
        de <strong className="text-foreground">{totalItems}</strong> {itemLabel}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>Items por página</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 rounded-[10px] border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center overflow-hidden rounded-[10px] border border-border bg-card">
          <button
            type="button"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            aria-label="Página anterior"
            className={cn(
              "flex size-9 items-center justify-center text-text-2 transition hover:bg-[var(--hover)] disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-20 border-x border-border px-3 text-center text-[12.5px] font-medium text-foreground">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            aria-label="Página siguiente"
            className={cn(
              "flex size-9 items-center justify-center text-text-2 transition hover:bg-[var(--hover)] disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
