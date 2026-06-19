"use client";

import { useMemo, useState, useActionState, useEffect } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  Plus,
  Search,
  Download,
  Wallet,
  AlertTriangle,
  XCircle,
  Boxes,
  Pencil,
  Loader2,
} from "lucide-react";
import { updateStock, type FormState } from "@/app/(app)/inventario/actions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtUSD, fmtUSDShort, fmtNum, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VInventory } from "@/lib/database.types";

const ESTADO_STYLE: Record<string, { bg: string; color: string }> = {
  "En stock": { bg: "var(--success-soft)", color: "var(--success)" },
  "Stock bajo": { bg: "var(--warning-soft)", color: "var(--warning)" },
  Agotado: { bg: "var(--danger-soft)", color: "var(--danger)" },
};

const TABS = [
  "Todos los productos",
  "Stock bajo",
  "Agotados",
  "Equipos médicos",
  "Más vendidos",
] as const;

export function InventarioView({
  rows,
  categories,
  brands,
  branchLabel,
  canEdit,
}: {
  rows: VInventory[];
  categories: string[];
  brands: string[];
  branchLabel: string;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Todos los productos");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [brand, setBrand] = useState("");
  const [editing, setEditing] = useState<VInventory | null>(null);

  const kpis = useMemo(
    () => ({
      value: rows.reduce((a, r) => a + Number(r.stock_value), 0),
      low: rows.filter((r) => r.estado === "Stock bajo").length,
      out: rows.filter((r) => r.estado === "Agotado").length,
      skus: rows.length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "Stock bajo") list = list.filter((r) => r.estado === "Stock bajo");
    else if (tab === "Agotados") list = list.filter((r) => r.estado === "Agotado");
    else if (tab === "Equipos médicos")
      list = list.filter((r) => r.category === "Equipos médicos");
    else if (tab === "Más vendidos")
      list = [...list].sort((a, b) => b.quantity - a.quantity);
    if (cat) list = list.filter((r) => r.category === cat);
    if (brand) list = list.filter((r) => r.brand === brand);
    const q = query.toLowerCase().trim();
    if (q)
      list = list.filter(
        (r) =>
          r.product_name.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q),
      );
    return list;
  }, [rows, tab, cat, brand, query]);

  function exportCsv() {
    const head = [
      "SKU",
      "Producto",
      "Categoría",
      "Marca",
      "Talla",
      "Color",
      "Stock",
      "Reservado",
      "Mínimo",
      "Costo",
      "Precio",
      "Sucursal",
      "Estado",
    ];
    const lines = filtered.map((r) =>
      [
        r.sku,
        r.product_name,
        r.category ?? "",
        r.brand ?? "",
        r.size ?? "",
        r.color ?? "",
        r.quantity,
        r.reserved,
        r.min_stock,
        r.cost,
        r.price,
        r.branch_city,
        r.estado,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventario-world-medics.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12">
      <div className="fadeup mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            Inventario
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            {fmtNum(kpis.skus)} SKUs · {branchLabel} · valor total{" "}
            <strong className="text-foreground">{fmtUSD(kpis.value)}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={exportCsv}
            className="iconbtn flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-card px-[13px] text-[13px] font-medium text-foreground"
          >
            <Download className="size-4 text-text-3" /> Exportar
          </button>
          {canEdit && (
            <Link
              href="/productos"
              className="hoverlift flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-[15px] text-[13px] font-semibold text-white"
            >
              <Plus className="size-4" /> Nuevo producto
            </Link>
          )}
        </div>
      </div>

      <div className="fadeup mb-[18px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Wallet} label="Valor del inventario" value={fmtUSDShort(kpis.value)} tone="brand" />
        <Kpi icon={AlertTriangle} label="Stock bajo" value={`${kpis.low} items`} tone="warning" />
        <Kpi icon={XCircle} label="Agotados" value={`${kpis.out} productos`} tone="danger" />
        <Kpi icon={Boxes} label="SKUs activos" value={fmtNum(kpis.skus)} tone="brand" />
      </div>

      <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition",
                tab === t
                  ? "bg-brand-soft text-brand"
                  : "text-text-2 hover:bg-[var(--hover)]",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-text-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por SKU o nombre…"
              className="h-[38px] w-full rounded-[10px] border border-border bg-surface-2 pr-3 pl-[37px] text-[13px] text-foreground outline-none"
            />
          </div>
          <FilterSelect value={cat} onChange={setCat} placeholder="Categoría" options={categories} />
          <FilterSelect value={brand} onChange={setBrand} placeholder="Marca" options={brands} />
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[2fr_1fr_1fr_0.6fr_0.9fr_1.2fr_0.8fr_0.8fr_1fr_0.9fr_auto] border-b border-border px-[22px] py-2 text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
              <span>Producto</span>
              <span>Categoría</span>
              <span>Marca</span>
              <span>Talla</span>
              <span>Color</span>
              <span>Stock</span>
              <span className="text-right">Costo</span>
              <span className="text-right">Precio</span>
              <span>Sucursal</span>
              <span className="text-right">Estado</span>
              <span />
            </div>
            {filtered.map((r) => {
              const st = ESTADO_STYLE[r.estado];
              const pct = Math.min(100, Math.round((r.quantity / Math.max(r.min_stock, 1)) * 100));
              return (
                <div
                  key={r.id}
                  className="tr-row grid grid-cols-[2fr_1fr_1fr_0.6fr_0.9fr_1.2fr_0.8fr_0.8fr_1fr_0.9fr_auto] items-center border-b border-border px-[22px] py-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-surface-2 text-[10.5px] font-bold text-text-2">
                      {initials(r.product_name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium text-foreground">
                        {r.product_name}
                      </div>
                      <div className="font-mono text-[11px] text-text-3">{r.sku}</div>
                    </div>
                  </div>
                  <span className="text-[12px] text-text-2">{r.category ?? "—"}</span>
                  <span className="text-[12px] text-text-2">{r.brand ?? "—"}</span>
                  <span className="text-[12px] text-text-2">{r.size ?? "—"}</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-text-2">
                    <span
                      className="size-2.5 rounded-full border border-border"
                      style={{ background: r.color_hex ?? "var(--surface-2)" }}
                    />
                    {r.color ?? "—"}
                  </span>
                  <div>
                    <div className="text-[12.5px]">
                      <span className="font-semibold text-foreground">{r.quantity}</span>
                      <span className="text-text-3"> / {r.min_stock} mín · {r.reserved} res</span>
                    </div>
                    <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background:
                            r.quantity === 0
                              ? "var(--danger)"
                              : r.quantity < r.min_stock
                                ? "var(--warning)"
                                : "var(--success)",
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-right text-[12px] text-text-2">{fmtUSD(r.cost)}</span>
                  <span className="text-right text-[12.5px] font-medium text-foreground">
                    {fmtUSD(r.price)}
                  </span>
                  <span className="text-[12px] text-text-2">{r.branch_city}</span>
                  <span className="text-right">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: st.bg, color: st.color }}
                    >
                      {r.estado}
                    </span>
                  </span>
                  <div className="flex justify-end">
                    {canEdit && (
                      <button
                        onClick={() => setEditing(r)}
                        className="iconbtn flex size-7 items-center justify-center rounded-md text-text-3"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-[22px] py-10 text-center text-[13px] text-text-3">
                No hay productos en esta vista.
              </div>
            )}
          </div>
        </div>
        <div className="px-[22px] py-3 text-[12px] text-text-3">
          Mostrando <strong className="text-foreground">{filtered.length}</strong>{" "}
          de <strong className="text-foreground">{rows.length}</strong> registros
        </div>
      </div>

      {canEdit && (
        <StockDialog row={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "brand" | "warning" | "danger";
}) {
  const map = {
    brand: { bg: "var(--brand-soft)", color: "var(--brand)" },
    warning: { bg: "var(--warning-soft)", color: "var(--warning)" },
    danger: { bg: "var(--danger-soft)", color: "var(--danger)" },
  }[tone];
  return (
    <div className="hoverlift flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card-sm">
      <span
        className="flex size-10 flex-none items-center justify-center rounded-xl"
        style={{ background: map.bg, color: map.color }}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12px] text-text-3">{label}</div>
        <div className="text-[18px] font-bold tracking-tight text-foreground">
          {value}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[38px] rounded-[10px] border border-border bg-card px-3 text-[12.5px] text-foreground outline-none"
    >
      <option value="">{placeholder}: todas</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" />}
      Guardar
    </Button>
  );
}

function StockDialog({
  row,
  onClose,
}: {
  row: VInventory | null;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    updateStock,
    null,
  );
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Ajustar inventario</DialogTitle>
        </DialogHeader>
        {row && (
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="sku" value={row.sku} />
            <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px]">
              <div className="font-medium text-foreground">{row.product_name}</div>
              <div className="text-text-3">
                {row.sku} · {row.branch_city}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Fld label="Stock" name="quantity" type="number" defaultValue={row.quantity} />
              <Fld label="Reservado" name="reserved" type="number" defaultValue={row.reserved} />
              <Fld label="Mínimo" name="min_stock" type="number" defaultValue={row.min_stock} />
            </div>
            {state?.error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                {state.error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <SaveBtn />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fld({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
    </div>
  );
}
