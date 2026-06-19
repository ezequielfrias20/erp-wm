"use client";

import { useMemo, useState, useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Users,
  Wallet,
  Receipt,
  RefreshCw,
  Mail,
  Phone,
  IdCard,
  MapPin,
  ShoppingCart,
  Pencil,
  StickyNote,
  Loader2,
  Heart,
} from "lucide-react";
import {
  saveCustomer,
  deleteCustomer,
  addNote,
  type FormState,
} from "@/app/(app)/clientes/actions";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtUSD, fmtUSDShort, fmtVES, fmtDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  CustomerEvent,
  VCustomerStats,
  VCustomerFavorite,
} from "@/lib/database.types";

const SEGMENTS = ["Todos", "VIP", "Frecuente", "Nuevo", "Inactivo"] as const;
const SEG_STYLE: Record<string, { bg: string; color: string }> = {
  VIP: { bg: "var(--warning-soft)", color: "var(--warning)" },
  Frecuente: { bg: "var(--brand-soft)", color: "var(--brand)" },
  Nuevo: { bg: "var(--success-soft)", color: "var(--success)" },
  Inactivo: { bg: "var(--surface-2)", color: "var(--text-3)" },
};
const EVENT_ICON = {
  compra: ShoppingCart,
  pago: Wallet,
  nota: StickyNote,
  registro: Users,
};

type Branch = { id: string; city: string };

export function ClientesView({
  customers,
  events,
  favorites,
  branches,
  rate,
  canEdit,
}: {
  customers: VCustomerStats[];
  events: CustomerEvent[];
  favorites: VCustomerFavorite[];
  branches: Branch[];
  rate: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [seg, setSeg] = useState<(typeof SEGMENTS)[number]>("Todos");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    customers[0]?.id ?? null,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VCustomerStats | null>(null);
  const [note, setNote] = useState("");
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let list = customers;
    if (seg !== "Todos") list = list.filter((c) => c.segment === seg);
    const q = query.toLowerCase().trim();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    return list;
  }, [customers, seg, query]);

  const selected =
    customers.find((c) => c.id === selectedId) ?? filtered[0] ?? customers[0] ?? null;

  const kpis = useMemo(() => {
    const withOrders = customers.filter((c) => c.orders_count > 0);
    const ltv = customers.reduce((a, c) => a + c.total_spent, 0) / Math.max(1, customers.length);
    const ticket =
      withOrders.reduce((a, c) => a + c.avg_ticket, 0) / Math.max(1, withOrders.length);
    const freq = customers.reduce((a, c) => a + c.orders_count, 0) / Math.max(1, customers.length);
    return {
      active: customers.filter((c) => c.segment !== "Inactivo").length,
      ltv,
      ticket,
      freq,
    };
  }, [customers]);

  const selEvents = useMemo(
    () =>
      events
        .filter((e) => e.customer_id === selected?.id)
        .sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at)),
    [events, selected],
  );
  const selFavs = useMemo(
    () =>
      favorites
        .filter((f) => f.customer_id === selected?.id)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 3),
    [favorites, selected],
  );

  function freqOf(c: VCustomerStats) {
    const months = Math.max(
      1,
      (Date.now() - +new Date(c.since)) / (1000 * 60 * 60 * 24 * 30),
    );
    return (c.orders_count / months).toFixed(1).replace(".", ",") + " /mes";
  }

  function onDelete(c: VCustomerStats) {
    if (!confirm(`¿Eliminar al cliente ${c.name}?`)) return;
    startTransition(async () => {
      const res = await deleteCustomer(c.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Cliente eliminado");
        setSelectedId(customers.find((x) => x.id !== c.id)?.id ?? null);
      }
    });
  }
  function submitNote() {
    if (!selected || !note.trim()) return;
    startTransition(async () => {
      const res = await addNote(selected.id, note);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Nota agregada");
        setNote("");
      }
    });
  }

  return (
    <div className="mx-auto max-w-[1560px] px-[30px] pt-[26px] pb-12">
      <div className="fadeup mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-tight text-foreground">
            Clientes
          </h1>
          <p className="mt-1 text-[13.5px] text-text-2">
            {customers.length} clientes registrados
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="hoverlift flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-[15px] text-[13px] font-semibold text-white"
          >
            <Plus className="size-4" /> Nuevo cliente
          </button>
        )}
      </div>

      <div className="fadeup mb-[18px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Users} label="Clientes activos" value={String(kpis.active)} />
        <Kpi icon={Wallet} label="LTV promedio" value={fmtUSD(kpis.ltv)} />
        <Kpi icon={Receipt} label="Ticket promedio" value={fmtUSD(kpis.ticket)} />
        <Kpi icon={RefreshCw} label="Frecuencia" value={`${kpis.freq.toFixed(1)} órd.`} />
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[340px_1fr]">
        {/* List */}
        <div className="fadeup flex max-h-[760px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card-sm">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-[16px] -translate-y-1/2 text-text-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente…"
                className="h-[36px] w-full rounded-[10px] border border-border bg-surface-2 pr-3 pl-9 text-[13px] text-foreground outline-none"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {SEGMENTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSeg(s)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[12px] font-medium transition",
                    seg === s ? "bg-brand-soft text-brand" : "text-text-2 hover:bg-[var(--hover)]",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                data-active={c.id === selected?.id}
                className="tr-row flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left data-[active=true]:bg-brand-soft"
              >
                <span className="flex size-9 flex-none items-center justify-center rounded-full bg-surface-2 text-[12px] font-bold text-text-2">
                  {initials(c.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {c.name}
                  </div>
                  <div className="truncate text-[11.5px] text-text-3">
                    {c.city ?? "—"} · {fmtUSDShort(c.total_spent)}
                  </div>
                </div>
                <SegBadge segment={c.segment} />
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center text-[12.5px] text-text-3">
                Sin clientes en este segmento.
              </div>
            )}
          </div>
        </div>

        {/* Detail */}
        {selected && (
          <div className="flex flex-col gap-[18px]">
            <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-[15px] font-bold text-text-2">
                    {initials(selected.name)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[17px] font-bold tracking-tight text-foreground">
                        {selected.name}
                      </h2>
                      <SegBadge segment={selected.segment} />
                    </div>
                    <div className="text-[12px] text-text-3">
                      Cliente desde {fmtDate(selected.since)} · sucursal{" "}
                      {selected.branch_city ?? "—"}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {canEdit && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(selected);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => router.push("/ventas")}
                        className="font-semibold"
                      >
                        <ShoppingCart className="size-3.5" /> Nueva venta
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Total gastado" value={fmtUSD(selected.total_spent)} sub={fmtVES(selected.total_spent * rate)} />
                <Stat label="Lifetime Value" value={fmtUSD(selected.total_spent * 1.15)} sub="proyectado" />
                <Stat label="Ticket promedio" value={fmtUSD(selected.avg_ticket)} sub={`${selected.orders_count} órdenes`} />
                <Stat label="Frecuencia" value={freqOf(selected)} sub="compras" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.3fr_1fr]">
              <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
                <div className="mb-4 text-[14px] font-bold tracking-tight text-foreground">
                  Historial de compras
                </div>
                <div className="flex flex-col">
                  {selEvents.map((e, i) => {
                    const Icon = EVENT_ICON[e.type];
                    return (
                      <div key={e.id} className="flex gap-3">
                        <div className="flex flex-none flex-col items-center">
                          <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-brand">
                            <Icon className="size-3.5" />
                          </span>
                          {i < selEvents.length - 1 && (
                            <span className="my-1 w-px flex-1 bg-border" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 pb-4">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12.5px] font-semibold text-foreground">
                              {e.title}
                            </span>
                            {e.amount != null && (
                              <span className="text-[12.5px] font-semibold text-foreground">
                                {fmtUSD(e.amount)}
                              </span>
                            )}
                          </div>
                          {e.detail && (
                            <div className="text-[12px] text-text-2">{e.detail}</div>
                          )}
                          <div className="mt-0.5 text-[11px] text-text-3">
                            {fmtDate(e.occurred_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {selEvents.length === 0 && (
                    <div className="py-6 text-center text-[12.5px] text-text-3">
                      Sin movimientos registrados.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-[18px]">
                <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
                  <div className="mb-3 text-[14px] font-bold tracking-tight text-foreground">
                    Contacto
                  </div>
                  <div className="flex flex-col gap-2.5 text-[12.5px]">
                    <Contact icon={Mail} value={selected.email ?? "—"} />
                    <Contact icon={Phone} value={selected.phone ?? "—"} />
                    <Contact icon={IdCard} value={selected.document ?? "—"} />
                    <Contact icon={MapPin} value={selected.city ?? "—"} />
                  </div>
                </div>

                <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
                  <div className="mb-3 flex items-center gap-1.5 text-[14px] font-bold tracking-tight text-foreground">
                    <Heart className="size-4 text-danger" /> Productos favoritos
                  </div>
                  <div className="flex flex-col gap-2">
                    {selFavs.map((f) => (
                      <div key={f.product_name} className="flex items-center gap-2 text-[12.5px]">
                        <span className="size-2 rounded-full bg-brand" />
                        <span className="flex-1 truncate text-text-2">{f.product_name}</span>
                        <span className="font-semibold text-foreground">×{f.qty}</span>
                      </div>
                    ))}
                    {selFavs.length === 0 && (
                      <div className="text-[12px] text-text-3">Sin compras aún.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="fadeup rounded-2xl border border-border bg-card p-5 shadow-card-sm">
              <div className="mb-2 flex items-center gap-1.5 text-[13.5px] font-bold text-foreground">
                <StickyNote className="size-4 text-text-3" /> Notas
              </div>
              {selected.notes && (
                <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-text-2">
                  {selected.notes}
                </p>
              )}
              {canEdit && (
                <div className="flex gap-2">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Agregar una nota al historial…"
                    onKeyDown={(e) => e.key === "Enter" && submitNote()}
                  />
                  <Button onClick={submitNote} disabled={!note.trim()} className="font-semibold">
                    Agregar
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {canEdit && (
        <CustomerForm
          open={formOpen}
          onOpenChange={setFormOpen}
          customer={editing}
          branches={branches}
          onDelete={editing ? () => onDelete(editing) : undefined}
        />
      )}
    </div>
  );
}

function SegBadge({ segment }: { segment: string }) {
  const s = SEG_STYLE[segment] ?? SEG_STYLE.Inactivo;
  return (
    <span
      className="flex-none rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      {segment}
    </span>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="hoverlift flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card-sm">
      <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12px] text-text-3">{label}</div>
        <div className="text-[18px] font-bold tracking-tight text-foreground">{value}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="text-[11px] text-text-3">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold tracking-tight text-foreground">{value}</div>
      <div className="text-[11px] text-text-3">{sub}</div>
    </div>
  );
}

function Contact({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-text-2">
      <Icon className="size-4 flex-none text-text-3" />
      <span className="truncate">{value}</span>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" />}
      Guardar
    </Button>
  );
}

function CustomerForm({
  open,
  onOpenChange,
  customer,
  branches,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: VCustomerStats | null;
  branches: Branch[];
  onDelete?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    saveCustomer,
    null,
  );
  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{customer ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          {customer && <input type="hidden" name="id" value={customer.id} />}
          <Fld label="Nombre" name="name" defaultValue={customer?.name} required />
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Correo" name="email" type="email" defaultValue={customer?.email ?? ""} />
            <Fld label="Teléfono" name="phone" defaultValue={customer?.phone ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Documento (V/J)" name="document" defaultValue={customer?.document ?? ""} />
            <Fld label="Ciudad" name="city" defaultValue={customer?.city ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Segmento</Label>
              <Select name="segment" defaultValue={customer?.segment ?? "Nuevo"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["VIP", "Frecuente", "Nuevo", "Inactivo"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sucursal</Label>
              <Select name="branch_id" defaultValue={customer?.branch_id ?? undefined}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={customer?.notes ?? ""} />
          </div>
          {state?.error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              {state.error}
            </p>
          )}
          <DialogFooter className="justify-between sm:justify-between">
            {onDelete ? (
              <Button type="button" variant="outline" className="text-danger" onClick={onDelete}>
                Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <SubmitButton />
            </div>
          </DialogFooter>
        </form>
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
