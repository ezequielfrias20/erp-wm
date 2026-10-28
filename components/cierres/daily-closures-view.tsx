"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { saveDailyClosure, type CountedLine } from "@/app/(app)/cierres/actions";
import type { DailyClosure, DailyClosureLine, DailyClosureSnapshot } from "@/lib/database.types";
import type { InvoiceCompany } from "@/components/factura/invoice-template";
import { printNode } from "@/components/factura/invoice-template";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DailyClosureReceipt, closureDateLabel, closureMoney } from "./daily-closure-receipt";

type BranchOption = { id: string; name: string; city: string; code: string };

function rowKey(row: Pick<DailyClosureLine, "source" | "method" | "currency">) {
  return JSON.stringify([row.source, row.method, row.currency]);
}

function initialAmounts(rows: DailyClosureLine[]) {
  return Object.fromEntries(rows.map((row) => [rowKey(row), row.expected === 0 ? "0.00" : ""]));
}

function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function totals(rows: DailyClosureLine[]) {
  return (["USD", "VES"] as const).map((currency) => ({
    currency,
    expected: rows.filter((row) => row.currency === currency)
      .reduce((sum, row) => sum + Number(row.expected), 0),
  }));
}

export function DailyClosuresView({
  branches, branch, date, today, preview, closure, history, loadError, canSave, company,
}: {
  branches: BranchOption[];
  branch: BranchOption | null;
  date: string;
  today: string;
  preview: DailyClosureSnapshot | null;
  closure: DailyClosure | null;
  history: DailyClosure[];
  loadError: string | null;
  canSave: boolean;
  company: InvoiceCompany;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<DailyClosure | null>(closure);
  const [amounts, setAmounts] = useState<Record<string, string>>(
    () => initialAmounts(preview?.rows ?? []),
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const displayed = saved ?? closure;
  const rows = preview?.rows ?? [];

  async function submit() {
    if (!branch || !preview || submitting) return;
    const counted: CountedLine[] = [];
    for (const row of rows) {
      const amount = parseAmount(amounts[rowKey(row)] ?? "");
      if (amount === null) {
        toast.error(`Confirma el monto de ${row.method} en ${row.currency}.`);
        return;
      }
      counted.push({
        source: row.source, method: row.method, currency: row.currency, amount,
      });
    }
    setSubmitting(true);
    try {
      const result = await saveDailyClosure({
        branchId: branch.id, date, counted, notes,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.closure) {
        setSaved(result.closure);
        toast.success("Cierre diario guardado.");
        router.refresh();
      }
    } catch {
      toast.error("No se pudo guardar el cierre. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Cierres diarios</h1>
          <p className="mt-1 text-sm text-text-2">
            Revisa lo registrado, confirma lo recibido y guarda el cierre de la sucursal.
          </p>
        </div>
        <Link href="/ventas" className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2">
          Volver a ventas
        </Link>
      </div>

      <form method="get" className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
        <div>
          <Label htmlFor="closure-branch">Sucursal</Label>
          <select id="closure-branch" name="branch" defaultValue={branch?.id ?? ""}
            disabled={branches.length <= 1}
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground">
            {branches.map((item) => (
              <option key={item.id} value={item.id}>{item.name} · {item.city}</option>
            ))}
          </select>
          {branches.length <= 1 && branch ? <input type="hidden" name="branch" value={branch.id} /> : null}
        </div>
        <div>
          <Label htmlFor="closure-date">Fecha</Label>
          <Input id="closure-date" name="date" type="date" max={today} defaultValue={date} className="mt-1.5" />
        </div>
        <Button type="submit" disabled={!branch} className="h-10">Consultar</Button>
      </form>

      {loadError ? (
        <div role="alert" className="mb-6 flex gap-2 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          No se pudieron cargar los cierres: {loadError}
        </div>
      ) : null}
      {!branch ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-text-2">
          No hay una sucursal disponible para cerrar.
        </div>
      ) : null}

      {branch && !loadError ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            {displayed ? (
              <div className="rounded-xl border border-emerald-300/50 bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="size-5" /> Cierre guardado · {closureDateLabel(date)}
                </div>
                <p className="mt-1 text-sm">
                  Esta foto no cambia si se registran más ventas de la fecha. Puedes imprimirla cuando la necesites.
                </p>
              </div>
            ) : preview ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="border-b border-border p-5">
                  <h2 className="text-lg font-semibold">{branch.name} · {closureDateLabel(date)}</h2>
                  <p className="mt-1 text-sm text-text-2">
                    {preview.sales_count} ventas pagadas · registrado hasta {new Intl.DateTimeFormat("es-VE", {
                      timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short",
                    }).format(new Date(preview.captured_at))}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[580px] text-sm">
                    <thead className="bg-surface-2 text-left text-xs text-text-2">
                      <tr><th className="px-5 py-3">Modalidad</th><th className="px-4 py-3">Registrado</th><th className="px-4 py-3">Confirmado</th><th className="px-4 py-3">Diferencia</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((row) => {
                        const amount = parseAmount(amounts[rowKey(row)] ?? "");
                        const difference = amount === null ? null : amount - Number(row.expected);
                        return (
                          <tr key={rowKey(row)}>
                            <td className="px-5 py-3 font-medium">
                              {row.method}
                              <span className="ml-2 text-xs font-normal text-text-3">{row.currency}</span>
                              {row.source === "cashea_settlement" ? <div className="text-xs font-normal text-text-3">Depósito conciliado, separado de las ventas</div> : null}
                              {row.source === "legacy" ? <div className="text-xs font-normal text-amber-700">Venta antigua sin detalle de pagos; verifica el monto recibido.</div> : null}
                            </td>
                            <td className="px-4 py-3 tabular-nums">{closureMoney(row.expected, row.currency)}</td>
                            <td className="px-4 py-3">
                              <Input aria-label={`Monto confirmado de ${row.method} en ${row.currency}`}
                                inputMode="decimal" value={amounts[rowKey(row)] ?? ""}
                                onChange={(event) => setAmounts((current) => ({ ...current, [rowKey(row)]: event.target.value }))}
                                placeholder="Monto recibido" className="h-9 w-32 text-right tabular-nums" />
                            </td>
                            <td className={`px-4 py-3 tabular-nums ${difference === null ? "text-text-3" : Math.abs(difference) < 0.005 ? "text-emerald-700" : "text-amber-700"}`}>
                              {difference === null ? "—" : closureMoney(difference, row.currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-border bg-surface-2 px-5 py-3 text-sm">
                  {totals(rows).map((total) => (
                    <div key={total.currency} className="flex justify-between gap-4 py-0.5">
                      <span>Total registrado {total.currency}</span>
                      <strong className="tabular-nums">{closureMoney(total.expected, total.currency)}</strong>
                    </div>
                  ))}
                </div>
                <div className="p-5">
                  <Label htmlFor="closure-notes">Observaciones (opcional)</Label>
                  <textarea id="closure-notes" value={notes} maxLength={1000}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Anota diferencias o incidencias del día"
                    className="mt-1.5 min-h-20 w-full rounded-md border border-border bg-background p-3 text-sm text-foreground" />
                  <p className="mt-3 text-xs text-text-3">
                    La inicial de Cashea aparece bajo el método con que se cobró. El importe financiado no entra al cierre.
                  </p>
                  <Button type="button" onClick={submit} disabled={!canSave || submitting} className="mt-4 h-10">
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Guardar cierre
                  </Button>
                  {!canSave ? <p className="mt-2 text-xs text-text-3">Tu acceso permite consultar, pero no guardar cierres.</p> : null}
                </div>
              </div>
            ) : null}

            {displayed ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Ticket de cierre</h2>
                  <Button type="button" onClick={() => printNode(receiptRef.current, `Cierre ${displayed.business_date}`)}>
                    <Printer className="size-4" /> Imprimir ticket 80 mm
                  </Button>
                </div>
                <div className="flex justify-center overflow-x-auto rounded-lg bg-surface-2 p-4">
                  <DailyClosureReceipt ref={receiptRef} closure={displayed} branchName={branch.name} company={company} />
                </div>
              </div>
            ) : null}
          </div>

          <aside className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Cierres guardados</h2>
            <p className="mt-1 text-xs text-text-3">Últimos 60 de esta sucursal.</p>
            <div className="mt-4 space-y-2">
              {history.length === 0 ? <p className="text-sm text-text-2">Todavía no hay cierres guardados.</p> : null}
              {history.map((item) => (
                <Link key={item.id} href={`/cierres?branch=${encodeURIComponent(branch.id)}&date=${item.business_date}`}
                  className={`block rounded-lg border px-3 py-2 text-sm hover:bg-surface-2 ${item.business_date === date ? "border-brand bg-brand/5" : "border-border"}`}>
                  <div className="font-medium">{closureDateLabel(item.business_date)}</div>
                  <div className="text-xs text-text-3">{item.snapshot.sales_count} ventas · {item.snapshot.rows.length} modalidades</div>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
