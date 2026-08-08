"use client";

import { useMemo, useState, useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  Plus,
  Search,
  Download,
  Upload,
  FileSpreadsheet,
  Wallet,
  AlertTriangle,
  XCircle,
  Boxes,
  Pencil,
  Loader2,
  X,
} from "lucide-react";
import {
  updateStock,
  importInventory,
  type FormState,
  type ImportRow,
} from "@/app/(app)/inventario/actions";
import { toast } from "sonner";
import { buildWorkbookBlob, downloadBlob, parseSheet } from "@/lib/excel";
import { Textarea } from "@/components/ui/textarea";
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
import { TablePagination } from "@/components/ui/table-pagination";
import { fmtUSD, fmtUSDShort, fmtNum, initials } from "@/lib/format";
import { matchesProductQuery } from "@/lib/search";
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

const INVENTORY_SHEET = "Inventario";
const INV_COLS = {
  sku: "Producto (SKU)",
  branch: "Sucursal",
  stock: "Stock",
  reserved: "Reservado",
  min: "Mínimo",
} as const;

export function InventarioView({
  rows,
  categories,
  brands,
  skuOptions,
  branchOptions,
  branchLabel,
  canEdit,
}: {
  rows: VInventory[];
  categories: string[];
  brands: string[];
  skuOptions: string[];
  branchOptions: string[];
  branchLabel: string;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Todos los productos");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [editing, setEditing] = useState<VInventory | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const kpis = useMemo(
    () => ({
      value: rows.reduce((a, r) => a + Number(r.stock_value), 0),
      low: rows.filter((r) => r.estado === "Stock bajo").length,
      out: rows.filter((r) => r.estado === "Agotado").length,
      skus: rows.length,
    }),
    [rows],
  );

  const filterOptions = useMemo(
    () => ({
      sizes: uniqueSorted(rows.map((r) => r.size)),
      colors: uniqueSorted(rows.map((r) => r.color)),
    }),
    [rows],
  );
  const hasFilters = Boolean(query.trim() || cat || brand || size || color);

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
    if (size) list = list.filter((r) => r.size === size);
    if (color) list = list.filter((r) => r.color === color);
    if (query.trim())
      list = list.filter(
        (r) => matchesProductQuery([
          r.product_name,
          r.sku,
          r.category,
          r.brand,
          r.size,
          r.color,
          r.branch_city,
          r.estado,
        ], query),
      );
    return list;
  }, [rows, tab, cat, brand, size, color, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const filteredValue = useMemo(
    () => filtered.reduce((a, r) => a + Number(r.stock_value), 0),
    [filtered],
  );
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  async function downloadTemplate() {
    try {
      const blob = await buildWorkbookBlob([
        {
          name: INVENTORY_SHEET,
          columns: [
            { header: INV_COLS.sku, key: "sku", width: 40, list: skuOptions },
            { header: INV_COLS.branch, key: "branch", width: 18, list: branchOptions },
            { header: INV_COLS.stock, key: "stock", width: 10 },
            { header: INV_COLS.reserved, key: "reserved", width: 12 },
            { header: INV_COLS.min, key: "min", width: 10 },
          ],
        },
      ]);
      downloadBlob(blob, "plantilla-inventario-world-medics.xlsx");
    } catch (e) {
      toast.error("No se pudo generar la plantilla.");
      console.error(e);
    }
  }

  async function exportXlsx() {
    try {
      const blob = await buildWorkbookBlob([
        {
          name: INVENTORY_SHEET,
          columns: [
            { header: INV_COLS.sku, key: "sku", width: 40 },
            { header: INV_COLS.branch, key: "branch", width: 18 },
            { header: INV_COLS.stock, key: "stock", width: 10 },
            { header: INV_COLS.reserved, key: "reserved", width: 12 },
            { header: INV_COLS.min, key: "min", width: 10 },
            { header: "Categoría", key: "category", width: 18 },
            { header: "Marca", key: "brand", width: 18 },
            { header: "Costo", key: "cost", width: 12 },
            { header: "Precio", key: "price", width: 12 },
            { header: "Estado", key: "estado", width: 14 },
          ],
          rows: filtered.map((r) => ({
            sku: `${r.sku} — ${r.product_name}${[r.size, r.color].filter(Boolean).length ? ` ${[r.size, r.color].filter(Boolean).join(" ")}` : ""}`,
            branch: r.branch_city,
            stock: r.quantity,
            reserved: r.reserved,
            min: r.min_stock,
            category: r.category ?? "",
            brand: r.brand ?? "",
            cost: r.cost,
            price: r.price,
            estado: r.estado,
          })),
        },
      ]);
      downloadBlob(blob, "inventario-world-medics.xlsx");
    } catch (e) {
      toast.error("No se pudo exportar.");
      console.error(e);
    }
  }

  return (
    <div className="mx-auto max-w-[1560px] px-4 pt-4 pb-8 sm:px-5 sm:pt-5 lg:px-[30px] lg:pt-[26px] lg:pb-12">
      <div className="fadeup mb-[18px] flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            Inventario
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            {fmtNum(filtered.length)} de {fmtNum(kpis.skus)} SKUs · {branchLabel} · valor visible{" "}
            <strong className="text-foreground">{fmtUSD(filteredValue)}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {canEdit && (
            <button
              onClick={downloadTemplate}
              className="iconbtn flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-[13px] text-[13px] font-medium text-foreground sm:h-[38px] sm:flex-none"
            >
              <Download className="size-4 text-text-3" /> Plantilla
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setImportOpen(true)}
              className="iconbtn flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-[13px] text-[13px] font-medium text-foreground sm:h-[38px] sm:flex-none"
            >
              <Upload className="size-4 text-text-3" /> Importar
            </button>
          )}
          <button
            onClick={exportXlsx}
            className="iconbtn flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-[13px] text-[13px] font-medium text-foreground sm:h-[38px] sm:flex-none"
          >
            <FileSpreadsheet className="size-4 text-text-3" /> Exportar
          </button>
          {canEdit && (
            <Link
              href="/productos"
              className="hoverlift flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-brand px-[15px] text-[13px] font-semibold text-white sm:h-[38px] sm:flex-none"
            >
              <Plus className="size-4" /> Nuevo producto
            </Link>
          )}
        </div>
      </div>

      <div className="fadeup mb-[18px] grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Kpi icon={Wallet} label="Valor del inventario" value={fmtUSDShort(kpis.value)} tone="brand" />
        <Kpi icon={AlertTriangle} label="Stock bajo" value={`${kpis.low} items`} tone="warning" />
        <Kpi icon={XCircle} label="Agotados" value={`${kpis.out} productos`} tone="danger" />
        <Kpi icon={Boxes} label="SKUs activos" value={fmtNum(kpis.skus)} tone="brand" />
      </div>

      <div className="fadeup overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 sm:flex-wrap sm:overflow-visible">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
              className={cn(
                "flex-none rounded-lg px-3 py-2 text-[12.5px] font-medium transition sm:py-1.5",
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
          <div className="relative min-w-0 flex-1 sm:min-w-[240px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-text-3" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre, SKU, talla, color, modelo…"
              className="h-11 w-full rounded-[10px] border border-border bg-surface-2 pr-3 pl-[37px] text-[16px] text-foreground outline-none sm:h-[38px] sm:text-[13px]"
            />
          </div>
          <FilterSelect
            value={cat}
            onChange={(value) => {
              setCat(value);
              setPage(1);
            }}
            placeholder="Categoría"
            options={categories}
          />
          <FilterSelect
            value={brand}
            onChange={(value) => {
              setBrand(value);
              setPage(1);
            }}
            placeholder="Marca"
            options={brands}
          />
          <FilterSelect
            value={size}
            onChange={(value) => {
              setSize(value);
              setPage(1);
            }}
            placeholder="Talla"
            options={filterOptions.sizes}
          />
          <FilterSelect
            value={color}
            onChange={(value) => {
              setColor(value);
              setPage(1);
            }}
            placeholder="Color"
            options={filterOptions.colors}
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCat("");
                setBrand("");
                setSize("");
                setColor("");
                setPage(1);
              }}
              className="iconbtn flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-3 text-[13px] font-medium text-text-2 sm:h-[38px] sm:w-auto"
            >
              <X className="size-4" /> Limpiar
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full table-fixed border-collapse">
            <thead className="border-b border-border text-[10.5px] font-bold tracking-[0.06em] text-text-3 uppercase">
              <tr>
                <th className="w-[24%] px-[22px] py-2 text-left">Producto</th>
                <th className="w-[12%] px-3 py-2 text-left">Categoría</th>
                <th className="w-[10%] px-3 py-2 text-left">Marca</th>
                <th className="w-[7%] px-3 py-2 text-left">Talla</th>
                <th className="w-[11%] px-3 py-2 text-left">Color</th>
                <th className="w-[14%] px-3 py-2 text-left">Stock</th>
                <th className="w-[8%] px-3 py-2 text-right">Costo</th>
                <th className="w-[8%] px-3 py-2 text-right">Precio</th>
                <th className="w-[11%] px-3 py-2 text-left">Sucursal</th>
                <th className="w-[10%] px-3 py-2 text-right">Estado</th>
                <th className="w-12 px-[22px] py-2" />
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => {
                const st = ESTADO_STYLE[r.estado] ?? ESTADO_STYLE["En stock"];
                const pct = Math.min(100, Math.round((r.quantity / Math.max(r.min_stock, 1)) * 100));
                return (
                  <tr key={r.id} className="tr-row border-b border-border">
                    <td className="px-[22px] py-3">
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
                    </td>
                    <td className="px-3 py-3 text-[12px] text-text-2">
                      <span className="block truncate">{r.category ?? "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-text-2">
                      <span className="block truncate">{r.brand ?? "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-text-2">
                      <span className="block truncate">{r.size ?? "—"}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-2">
                        <span
                          className="size-2.5 flex-none rounded-full border border-border"
                          style={{ background: r.color_hex ?? "var(--surface-2)" }}
                        />
                        <span className="truncate">{r.color ?? "—"}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px]">
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
                    </td>
                    <td className="px-3 py-3 text-right text-[12px] text-text-2">{fmtUSD(r.cost)}</td>
                    <td className="px-3 py-3 text-right text-[12.5px] font-medium text-foreground">
                      {fmtUSD(r.price)}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-text-2">
                      <span className="block truncate">{r.branch_city}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {r.estado}
                      </span>
                    </td>
                    <td className="px-[22px] py-3">
                      <div className="flex justify-end">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setEditing(r)}
                            className="iconbtn flex size-7 items-center justify-center rounded-md text-text-3"
                            aria-label={`Editar inventario de ${r.product_name}`}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-[22px] py-10 text-center text-[13px] text-text-3">
                    No hay productos en esta vista.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
        />
      </div>

      {canEdit && (
        <StockDialog row={editing} onClose={() => setEditing(null)} />
      )}
      {canEdit && (
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      )}
    </div>
  );
}

/** Extrae el SKU de un valor que puede venir como "SKU — Producto Talla". */
function cleanSku(v: string): string {
  return String(v ?? "").split("—")[0].trim();
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b),
  );
}

function parseInventoryCsv(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l: string) =>
    l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const find = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iSku = find(["sku", "código", "codigo", "producto (sku)"]);
  const iBranch = find(["sucursal", "branch", "tienda", "ciudad"]);
  const iQty = find(["stock", "cantidad", "quantity", "existencia", "qty"]);
  const iRes = find(["reservado", "reserved", "reserva"]);
  const iMin = find(["minimo", "mínimo", "min", "min_stock"]);

  // Headerless fallback: assume order sku, sucursal, stock, reservado, minimo.
  const hasHeader = iSku >= 0 && iBranch >= 0;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const cols = hasHeader
    ? { sku: iSku, branch: iBranch, qty: iQty, res: iRes, min: iMin }
    : { sku: 0, branch: 1, qty: 2, res: 3, min: 4 };

  const optNum = (c: string[], i: number) =>
    i >= 0 && c[i] !== "" && c[i] != null ? Number(c[i]) : null;

  return dataLines
    .map((l) => split(l))
    .filter((c) => c[cols.sku] && c[cols.branch])
    .map((c) => ({
      sku: cleanSku(c[cols.sku]),
      branch: c[cols.branch],
      quantity: Number(c[cols.qty] ?? 0),
      reserved: optNum(c, cols.res),
      min_stock: optNum(c, cols.min),
    }));
}

function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [xlsxRows, setXlsxRows] = useState<ImportRow[] | null>(null);
  const [xlsxName, setXlsxName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File) {
    if (f.name.toLowerCase().endsWith(".xlsx")) {
      try {
        const raw = await parseSheet(f, INVENTORY_SHEET);
        const rows: ImportRow[] = raw.map((r) => ({
          sku: cleanSku(r[INV_COLS.sku] ?? r["SKU"] ?? ""),
          branch: r[INV_COLS.branch] ?? "",
          quantity: Number(r[INV_COLS.stock] ?? 0),
          reserved: r[INV_COLS.reserved] !== "" && r[INV_COLS.reserved] != null ? Number(r[INV_COLS.reserved]) : null,
          min_stock: r[INV_COLS.min] !== "" && r[INV_COLS.min] != null ? Number(r[INV_COLS.min]) : null,
        }));
        setXlsxRows(rows);
        setXlsxName(f.name);
        setText("");
      } catch (e) {
        toast.error("No se pudo leer el .xlsx. ¿Es la plantilla de inventario?");
        console.error(e);
      }
    } else {
      // CSV / texto
      const t = await f.text();
      setText(t);
      setXlsxRows(null);
      setXlsxName("");
    }
  }

  async function run() {
    const rows = xlsxRows ?? parseInventoryCsv(text);
    if (!rows.length) {
      toast.error("No se detectaron filas válidas. Revisa el formato.");
      return;
    }
    setBusy(true);
    const res = await importInventory(rows);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      `${res.imported} fila(s) importada(s)${res.skipped ? `, ${res.skipped} omitida(s)` : ""}.`,
    );
    setText("");
    setXlsxRows(null);
    setXlsxName("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Importar inventario</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-text-3">
            Descarga la <strong>Plantilla</strong> (.xlsx con listas de SKU y sucursal) o
            usa un CSV con columnas{" "}
            <code className="text-text-2">sku, sucursal, stock, reservado, minimo</code>. La
            sucursal puede ser la ciudad o el código (CCS, VLN…); reservado y mínimo son
            opcionales.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="w-max"
          >
            <Upload className="size-4" /> Cargar archivo (.xlsx o .csv)
          </Button>
          {xlsxRows ? (
            <div className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] text-success">
              {xlsxName}: {xlsxRows.length} fila(s) listas para importar.
            </div>
          ) : (
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={"sku,sucursal,stock,reservado,minimo\nSCB-AZ-M,Caracas,40,5,12\nBAT-BL-M,VLN,25,0,20"}
              className="font-mono text-[12px]"
            />
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={run}
            disabled={busy || (!xlsxRows && !text.trim())}
            className="font-semibold"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      className="h-11 w-full rounded-[10px] border border-border bg-card px-3 text-[16px] text-foreground outline-none sm:h-[38px] sm:w-auto sm:text-[12.5px]"
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
