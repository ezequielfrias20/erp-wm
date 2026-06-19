"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Plus,
  Store,
  MapPin,
  Phone,
  Pencil,
  Trash2,
  Trophy,
} from "lucide-react";
import { BranchForm } from "@/components/sucursales/branch-form";
import { deleteBranch } from "@/app/(app)/sucursales/actions";
import { fmtUSDShort, fmtNum, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { VBranchStats } from "@/lib/database.types";

export function SucursalesView({
  branches,
  managers,
  canEdit,
}: {
  branches: VBranchStats[];
  managers: { id: string; full_name: string }[];
  canEdit: boolean;
}) {
  const [selectedId, setSelectedId] = useState(branches[0]?.id ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VBranchStats | null>(null);
  const [, startTransition] = useTransition();

  const selected =
    branches.find((b) => b.id === selectedId) ?? branches[0] ?? null;
  const salesMax = Math.max(1, ...branches.map((b) => b.month_sales));
  const totals = useMemo(
    () => ({
      sales: branches.reduce((a, b) => a + b.month_sales, 0),
      units: branches.reduce((a, b) => a + b.inventory_units, 0),
      active: branches.filter((b) => b.is_active).length,
    }),
    [branches],
  );

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(b: VBranchStats) {
    setEditing(b);
    setFormOpen(true);
  }
  function onDelete(b: VBranchStats) {
    if (!confirm(`¿Eliminar la sucursal ${b.city}? Esta acción no se puede deshacer.`))
      return;
    startTransition(async () => {
      const res = await deleteBranch(b.id);
      if (res?.error) toast.error(res.error);
      else toast.success("Sucursal eliminada");
    });
  }

  const pct = (b: VBranchStats) =>
    b.monthly_goal > 0 ? Math.round((b.month_sales / b.monthly_goal) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12">
      <div className="fadeup mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            Sucursales
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            {totals.active} tiendas activas · ventas del mes{" "}
            {fmtUSDShort(totals.sales)} · {fmtNum(totals.units)} uds en inventario
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openNew}
            className="hoverlift flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-[15px] text-[13px] font-semibold text-white"
          >
            <Plus className="size-4" /> Nueva sucursal
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        {/* Map */}
        <div className="fadeup relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card-sm">
          <div className="mb-3 flex items-center gap-2 text-[12.5px] font-medium text-text-2">
            <MapPin className="size-4 text-brand" /> Cobertura nacional ·
            Venezuela
          </div>
          <div
            className="relative h-[320px] w-full overflow-hidden rounded-xl border border-border"
            style={{
              background:
                "radial-gradient(120% 90% at 30% 20%, var(--brand-soft), transparent 60%), var(--surface-2)",
            }}
          >
            {branches.map((b) => {
              const active = b.id === selected?.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${b.map_x ?? 50}%`, top: `${b.map_y ?? 40}%` }}
                  title={b.city}
                >
                  <span
                    className={cn(
                      "flex items-center justify-center rounded-full border-2 border-card shadow-card-md transition-all",
                      active ? "size-5" : "size-3.5",
                    )}
                    style={{ background: b.color ?? "var(--brand)" }}
                  />
                  {active && (
                    <span className="absolute top-6 left-1/2 -translate-x-1/2 rounded-md bg-card px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-foreground shadow-card-md">
                      {b.city}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        {selected && (
          <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Store className="size-5" />
                </span>
                <div>
                  <div className="text-[15px] font-bold tracking-tight text-foreground">
                    {selected.city}
                  </div>
                  <div className="text-[12px] text-text-3">{selected.name}</div>
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(selected)}
                    className="iconbtn flex size-8 items-center justify-center rounded-lg text-text-2"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => onDelete(selected)}
                    className="iconbtn flex size-8 items-center justify-center rounded-lg text-text-2 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2.5 text-[12.5px]">
              <div className="flex items-center gap-2 text-text-2">
                <MapPin className="size-4 flex-none text-text-3" />
                {selected.address ?? "—"}
              </div>
              <div className="flex items-center gap-2 text-text-2">
                <Phone className="size-4 flex-none text-text-3" />
                {selected.phone ?? "—"}
              </div>
              <div className="flex items-center gap-2 text-text-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-surface-2 text-[9px] font-bold text-text-2">
                  {initials(selected.manager_name)}
                </span>
                Responsable:{" "}
                <strong className="font-semibold text-foreground">
                  {selected.manager_name ?? "Sin asignar"}
                </strong>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Ventas del mes" value={fmtUSDShort(selected.month_sales)} />
              <Stat label="Inventario total" value={`${fmtNum(selected.inventory_units)} uds`} sub="en existencia" />
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[12.5px]">
                <span className="text-text-2">Cumplimiento de meta</span>
                <span className="font-semibold text-foreground">{pct(selected)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, pct(selected))}%`,
                    background: "linear-gradient(90deg,var(--brand-2),var(--brand))",
                  }}
                />
              </div>
              <div className="mt-1 text-[11px] text-text-3">
                Meta mensual {fmtUSDShort(selected.monthly_goal)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Ranking */}
      <div className="fadeup mt-[18px] rounded-2xl border border-border bg-card p-5 shadow-card-sm">
        <div className="mb-4 flex items-center gap-2 text-[15px] font-bold tracking-tight text-foreground">
          <Trophy className="size-[18px] text-warning" /> Ranking de desempeño
        </div>
        <div className="flex flex-col gap-3">
          {branches.map((b, i) => (
            <div key={b.id} className="flex items-center gap-3">
              <span className="flex size-6 flex-none items-center justify-center rounded-lg bg-surface-2 text-[11.5px] font-bold text-text-2">
                {i + 1}
              </span>
              <span className="w-28 flex-none text-[12.5px] font-medium text-foreground">
                {b.city}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(b.month_sales / salesMax) * 100}%`,
                    background: "linear-gradient(90deg,var(--brand-2),var(--brand))",
                  }}
                />
              </div>
              <span className="w-20 flex-none text-right text-[12.5px] font-semibold text-foreground">
                {fmtUSDShort(b.month_sales)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="mt-[18px] grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-3">
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelectedId(b.id)}
            data-active={b.id === selected?.id}
            className="hoverlift rounded-2xl border border-border bg-card p-5 text-left shadow-card-sm data-[active=true]:ring-2 data-[active=true]:ring-brand"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex size-9 items-center justify-center rounded-xl text-white"
                  style={{ background: b.color ?? "var(--brand)" }}
                >
                  <Store className="size-[18px]" />
                </span>
                <div>
                  <div className="text-[13.5px] font-bold text-foreground">
                    {b.city}
                  </div>
                  <div className="text-[11.5px] text-text-3">
                    Resp. {b.manager_name ?? "—"}
                  </div>
                </div>
              </div>
              <span className="text-[13px] font-bold text-brand">{pct(b)}%</span>
            </div>
            <div className="mt-3 truncate text-[12px] text-text-3">
              {b.address ?? "—"}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-text-3">Ventas mes</div>
                <div className="text-[14px] font-bold text-foreground">
                  {fmtUSDShort(b.month_sales)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-text-3">Inventario</div>
                <div className="text-[14px] font-bold text-foreground">
                  {fmtNum(b.inventory_units)} uds
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {canEdit && (
        <BranchForm
          open={formOpen}
          onOpenChange={setFormOpen}
          branch={editing}
          managers={managers}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="text-[11px] text-text-3">{label}</div>
      <div className="mt-0.5 text-[16px] font-bold tracking-tight text-foreground">
        {value}
      </div>
      {sub && <div className="text-[11px] text-text-3">{sub}</div>}
    </div>
  );
}
