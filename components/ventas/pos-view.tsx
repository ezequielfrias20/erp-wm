"use client";

import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Store,
  UserRound,
  Loader2,
  FileText,
  Save,
  Layers,
  Trash2,
  Pencil,
  X,
  CheckCircle2,
} from "lucide-react";
import {
  checkout,
  findCustomerByDocument,
  createPosCustomer,
  type CheckoutItem,
  type SalePaymentInput,
} from "@/app/(app)/ventas/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtUSD, fmtVES, fmtByCurrency, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  InvoiceDocument,
  printNode,
  type InvoiceData,
  type InvoiceCompany,
} from "@/components/factura/invoice-template";
import {
  saveDraft,
  removeDraft,
  newDraftId,
  subscribeDrafts,
  draftsSnapshot,
  draftsServerSnapshot,
  type PosDraft,
} from "@/lib/pos-drafts";

export type PosProduct = {
  variant_id: string;
  sku: string;
  product_name: string;
  category: string | null;
  price: number;
  cost: number;
  color: string | null;
  color_hex: string | null;
  size: string | null;
  stock: number;
};
export type PosCustomer = {
  id: string;
  name: string;
  document: string | null;
  segment: string;
};
export type PaymentMethodOption = {
  name: string;
  currency: "USD" | "VES";
  requires_reference: boolean;
  is_financed: boolean;
};

/** Pago con Cashea capturado en el POS: inicial (efectivo) + lo que financia Cashea. */
export type CasheaDraft = {
  initial: SalePaymentInput[];
  reference: string;
  financed: number; // USD por cobrar a Cashea = total − inicial
  channel: "tienda" | "online"; // canal: en sucursal o marketplace
};

type CartLine = PosProduct & { qty: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: number) => Math.round(round2(n) * 100);
const moneyPattern = /^\d+(?:\.\d{1,2})?$/;
const formatAmountInput = (n: number) => round2(n).toFixed(2);
const centsToMoney = (value: number) => Math.abs(value) / 100;
const invoicePreviewWidth = 720;

function subscribeViewport(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

function viewportSnapshot() {
  return `${window.innerWidth}x${window.innerHeight}`;
}

function viewportServerSnapshot() {
  return "1180x820";
}

function estimateInvoiceHeight(data: InvoiceData | null) {
  if (!data) return 720;
  return Math.max(620, 500 + data.items.length * 31 + data.payments.length * 32);
}

function variantAttributes(p: Pick<PosProduct, "color" | "size">) {
  return [
    p.color ? `Color: ${p.color}` : null,
    p.size ? `Talla: ${p.size}` : null,
  ].filter(Boolean) as string[];
}

function variantDescription(p: Pick<PosProduct, "product_name" | "color" | "size">) {
  const attrs = variantAttributes(p);
  return attrs.length ? `${p.product_name} (${attrs.join(", ")})` : p.product_name;
}

export function PosView({
  products,
  customers,
  paymentMethods,
  branch,
  rate,
  company,
  cashier,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  paymentMethods: PaymentMethodOption[];
  branch: { id: string; city: string } | null;
  rate: number;
  company: InvoiceCompany;
  cashier: string | null;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("Todos");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [custOpen, setCustOpen] = useState(false);
  const [discountPct, setDiscountPct] = useState(0);
  const [pending, startTransition] = useTransition();

  const realMethods = useMemo(
    // Excluye Mixto y métodos financiados (Cashea): la inicial no se paga con Cashea.
    () => paymentMethods.filter((m) => m.name !== "Mixto" && !m.is_financed),
    [paymentMethods],
  );
  const hasMixto = paymentMethods.some((m) => m.name === "Mixto");
  const hasCashea = paymentMethods.some((m) => m.is_financed);

  const [selectedMethod, setSelectedMethod] = useState(
    realMethods[0]?.name ?? "Efectivo USD",
  );
  const [singleReference, setSingleReference] = useState("");
  const [mixed, setMixed] = useState<SalePaymentInput[] | null>(null);
  const [mixedOpen, setMixedOpen] = useState(false);
  const [cashea, setCashea] = useState<CasheaDraft | null>(null);
  const [casheaOpen, setCasheaOpen] = useState(false);

  const drafts = useSyncExternalStore(
    subscribeDrafts,
    draftsSnapshot,
    draftsServerSnapshot,
  );
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  const [lastSale, setLastSale] = useState<InvoiceData | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [saleCompleteOpen, setSaleCompleteOpen] = useState(false);

  const categories = useMemo(
    () => ["Todos", ...new Set(products.map((p) => p.category).filter(Boolean) as string[])],
    [products],
  );

  const filtered = useMemo(() => {
    let list = products;
    if (cat !== "Todos") list = list.filter((p) => p.category === cat);
    const q = query.toLowerCase().trim();
    if (q)
      list = list.filter(
        (p) =>
          p.product_name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.color?.toLowerCase().includes(q) ?? false) ||
          (p.size?.toLowerCase().includes(q) ?? false),
      );
    return list;
  }, [products, cat, query]);

  const lines = Object.values(cart);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const discount = (subtotal * discountPct) / 100;
  const taxbase = subtotal - discount;
  const tax = taxbase * 0.16;
  const total = round2(taxbase + tax);
  const count = lines.reduce((a, l) => a + l.qty, 0);

  function add(p: PosProduct) {
    setCart((c) => {
      const existing = c[p.variant_id];
      const qty = (existing?.qty ?? 0) + 1;
      if (qty > p.stock) {
        toast.warning(`Solo hay ${p.stock} en stock de ${variantDescription(p)}`);
        return c;
      }
      return { ...c, [p.variant_id]: { ...p, qty } };
    });
  }
  function setQty(id: string, qty: number) {
    setCart((c) => {
      if (qty <= 0) {
        const rest = { ...c };
        delete rest[id];
        return rest;
      }
      const line = c[id];
      if (line && qty > line.stock) return c;
      return { ...c, [id]: { ...line, qty } };
    });
  }

  function resolvePayments(): { payments?: SalePaymentInput[]; error?: string } {
    if (cashea) {
      // Inicial (efectivo real) + una línea financiada por Cashea (por cobrar).
      return {
        payments: [
          ...cashea.initial,
          {
            method: "Cashea",
            currency: "USD",
            amount: cashea.financed,
            amount_usd: cashea.financed,
            reference: cashea.reference,
          },
        ],
      };
    }
    if (mixed && mixed.length) return { payments: mixed };
    const pm = realMethods.find((m) => m.name === selectedMethod);
    if (!pm) return { error: "Selecciona un método de pago." };
    if (pm.requires_reference && !singleReference.trim())
      return { error: `Ingresa el número de referencia de ${pm.name}.` };
    const amount_usd = round2(total);
    const amount = pm.currency === "VES" ? round2(total * rate) : amount_usd;
    return {
      payments: [
        {
          method: pm.name,
          currency: pm.currency,
          amount,
          amount_usd,
          reference: singleReference.trim() || null,
        },
      ],
    };
  }

  function clearTicket() {
    setCart({});
    setCustomer(null);
    setDiscountPct(0);
    setMixed(null);
    setCashea(null);
    setSingleReference("");
    setActiveDraftId(null);
  }

  function complete() {
    if (!branch) return toast.error("No hay sucursal seleccionada.");
    if (lines.length === 0) return toast.error("El ticket está vacío.");
    if (!customer) {
      setCustOpen(true);
      return toast.error("Selecciona un cliente para cobrar la venta.");
    }
    const selectedCustomer = customer;
    const resolved = resolvePayments();
    if (resolved.error || !resolved.payments) return toast.error(resolved.error);
    const payments = resolved.payments;
    const paidUsd = payments.reduce((a, p) => a + p.amount_usd, 0);
    const paymentDiffCents = cents(total) - cents(paidUsd);
    if (paymentDiffCents !== 0) {
      return toast.error(
        paymentDiffCents > 0
          ? `Falta por cubrir ${fmtUSD(centsToMoney(paymentDiffCents))}.`
          : `El pago excede el total por ${fmtUSD(centsToMoney(paymentDiffCents))}.`,
      );
    }

    const items: CheckoutItem[] = lines.map((l) => ({
      variant_id: l.variant_id,
      description: variantDescription(l),
      quantity: l.qty,
      unit_price: l.price,
      cost: l.cost,
    }));

    // Capturamos el estado actual para construir la factura tras limpiar.
    const snapshot = {
      cust: selectedCustomer,
      lines: lines.map((l) => ({
        description: variantDescription(l),
        quantity: l.qty,
        unit_price: l.price,
        line_total: round2(l.qty * l.price),
      })),
      subtotal: round2(subtotal),
      discount: round2(discount),
      discount_pct: discountPct,
      tax: round2(tax),
      total,
      payments,
      draftId: activeDraftId,
    };

    startTransition(async () => {
      const res = await checkout({
        branch_id: branch.id,
        customer_id: selectedCustomer.id,
        payments,
        discount_pct: discountPct,
        rate,
        items,
        status: "Pagada",
        cashea: cashea
          ? {
              reference: cashea.reference,
              initial_amount: round2(
                cashea.initial.reduce((a, p) => a + p.amount_usd, 0),
              ),
              financed_amount: cashea.financed,
              commission_pct: 0,
              channel: cashea.channel,
            }
          : undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const inv: InvoiceData = {
        company,
        invoiceNumber: res.invoice ?? "—",
        date: res.createdAt ?? new Date().toISOString(),
        status: "Pagada",
        branchName: branch.city,
        cashier,
        customer: snapshot.cust
          ? {
              name: snapshot.cust.name,
              document: snapshot.cust.document,
              phone: null,
            }
          : null,
        items: snapshot.lines,
        subtotal: snapshot.subtotal,
        discount: snapshot.discount,
        discount_pct: snapshot.discount_pct,
        tax: snapshot.tax,
        total: snapshot.total,
        rate,
        total_ves: round2(snapshot.total * rate),
        payments: snapshot.payments.map((p) => ({
          ...p,
          is_financed:
            paymentMethods.find((m) => m.name === p.method)?.is_financed ?? false,
        })),
      };
      setLastSale(inv);
      setSaleCompleteOpen(true);
      if (snapshot.draftId) {
        removeDraft(snapshot.draftId);
      }
      clearTicket();
      toast.success(`Venta ${res.invoice} registrada`);
    });
  }

  function saveDraftNow() {
    if (lines.length === 0) return toast.error("El ticket está vacío.");
    const id = activeDraftId ?? newDraftId();
    const draft: PosDraft = {
      id,
      createdAt: new Date().toISOString(),
      branchId: branch?.id ?? null,
      label: customer?.name ?? `Ticket · ${count} art. · ${fmtUSD(total)}`,
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            document: customer.document,
            segment: customer.segment,
          }
        : null,
      discountPct,
      lines: lines.map((l) => ({ ...l })),
    };
    saveDraft(draft);
    clearTicket();
    toast.success("Borrador guardado");
  }

  function restoreDraft(d: PosDraft) {
    const newCart: Record<string, CartLine> = {};
    for (const l of d.lines) {
      newCart[l.variant_id] = {
        ...l,
        color: l.color ?? null,
        size: l.size ?? null,
      };
    }
    setCart(newCart);
    setCustomer(d.customer);
    setDiscountPct(d.discountPct);
    setActiveDraftId(d.id);
    setMixed(null);
    setSingleReference("");
    setDraftsOpen(false);
    toast.success("Borrador restaurado");
  }

  function deleteDraft(id: string) {
    removeDraft(id);
    if (activeDraftId === id) setActiveDraftId(null);
  }

  const selectedPm = realMethods.find((m) => m.name === selectedMethod);
  const mixedPaidUsd = (mixed ?? []).reduce((a, p) => a + p.amount_usd, 0);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[1fr_420px] lg:overflow-hidden">
      {/* Catálogo */}
      <div className="flex min-h-0 flex-col overflow-hidden">
        <div className="px-[30px] pt-[22px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-foreground">
                Punto de venta
              </h1>
              <p className="mt-0.5 text-[12.5px] text-text-2">
                Sucursal {branch?.city ?? "—"} · Caja 01 · tasa {fmtVES(rate)}
              </p>
            </div>
            <button
              onClick={() => setDraftsOpen(true)}
              className="iconbtn relative flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-[13px] font-medium text-foreground"
            >
              <Layers className="size-4 text-text-3" /> Borradores
              {drafts.length > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[10.5px] font-bold text-white">
                  {drafts.length}
                </span>
              )}
            </button>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-text-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto por nombre o SKU…"
              className="h-[42px] w-full rounded-[12px] border border-border bg-card pr-3 pl-[37px] text-[13px] text-foreground outline-none"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition",
                  cat === c
                    ? "bg-brand text-white"
                    : "border border-border bg-card text-text-2 hover:bg-[var(--hover)]",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[30px] py-4">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-text-3">
              No hay productos con stock en esta sucursal.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => (
                <button
                  key={p.variant_id}
                  onClick={() => add(p)}
                  title={variantDescription(p)}
                  className="hoverlift flex min-h-[258px] flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-card-sm"
                >
                  <div
                    className="flex h-20 items-center justify-center text-[18px] font-bold text-white"
                    style={{
                      background: `linear-gradient(140deg, ${p.color_hex ?? "#0EA5E9"}, color-mix(in srgb, ${p.color_hex ?? "#0EA5E9"} 70%, #000))`,
                    }}
                  >
                    {initials(p.product_name)}
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-[10.5px] font-medium tracking-wide text-text-3 uppercase">
                        {p.category ?? "Sin categoría"}
                      </div>
                      <div className="flex-none text-[10.5px] font-medium text-text-3">
                        {p.stock} disp.
                      </div>
                    </div>
                    <div className="line-clamp-3 text-[13px] leading-snug font-semibold text-foreground">
                      {p.product_name}
                    </div>
                    {(p.color || p.size) && (
                      <div className="flex flex-wrap gap-1.5">
                        {p.color && (
                          <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-medium text-text-2">
                            <span
                              className="size-2.5 flex-none rounded-full border border-black/10"
                              style={{ backgroundColor: p.color_hex ?? "#CBD5E1" }}
                              aria-hidden="true"
                            />
                            <span className="truncate">{p.color}</span>
                          </span>
                        )}
                        {p.size && (
                          <span className="inline-flex rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-semibold text-text-2">
                            Talla {p.size}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-auto text-[10.5px] font-medium text-text-3">
                      SKU {p.sku}
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[13px] font-bold text-foreground">
                          {fmtUSD(p.price)}
                        </div>
                        <div className="text-[10.5px] text-text-3">
                          {fmtVES(p.price * rate)}
                        </div>
                      </div>
                      <span className="flex size-7 items-center justify-center rounded-full bg-brand text-white">
                        <Plus className="size-4" />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ticket */}
      <div className="flex min-h-0 flex-col overflow-hidden border-l border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <ShoppingCart className="size-[18px]" />
            </span>
            <div>
              <div className="text-[14px] font-bold text-foreground">Ticket de venta</div>
              <div className="text-[11.5px] text-text-3">
                {count} artículos{activeDraftId ? " · borrador" : ""}
              </div>
            </div>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-text-2">
            <Store className="size-3.5" /> {branch?.city ?? "—"}
          </span>
        </div>

        <button
          onClick={() => setCustOpen(true)}
          className="tr-row flex items-center gap-2.5 border-b border-border px-4 py-3 text-left"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-[12px] font-bold text-text-2">
            {customer ? initials(customer.name) : <UserRound className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-foreground">
              {customer?.name ?? "Selecciona un cliente"}
            </div>
            <div className="truncate text-[11.5px] text-text-3">
              {customer?.document ?? "Requerido para cobrar"}
            </div>
          </div>
          <span className="text-[12px] font-medium text-brand">Cambiar</span>
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <ShoppingCart className="size-8 text-text-3" />
              <div className="text-[13px] font-semibold text-foreground">Carrito vacío</div>
              <div className="text-[12px] text-text-3">Toca un producto para agregarlo</div>
            </div>
          ) : (
            lines.map((l) => (
              <div
                key={l.variant_id}
                className="flex items-center gap-2.5 border-b border-border px-4 py-2.5"
              >
                <span
                  className="flex size-8 flex-none items-center justify-center rounded-lg text-[10px] font-bold text-white"
                  style={{ background: l.color_hex ?? "#0EA5E9" }}
                >
                  {initials(l.product_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="whitespace-normal break-words text-[12.5px] leading-snug font-medium text-foreground">
                    {l.product_name}
                  </div>
                  {(l.color || l.size) && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {l.color && (
                        <span className="inline-flex max-w-[120px] items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-text-2">
                          <span
                            className="size-2 flex-none rounded-full border border-black/10"
                            style={{ backgroundColor: l.color_hex ?? "#CBD5E1" }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{l.color}</span>
                        </span>
                      )}
                      {l.size && (
                        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-text-2">
                          Talla {l.size}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-text-3">
                    {fmtUSD(l.price)} c/u
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setQty(l.variant_id, l.qty - 1)}
                    className="iconbtn flex size-6 items-center justify-center rounded-md border border-border text-text-2"
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="w-5 text-center text-[12.5px] font-semibold text-foreground">
                    {l.qty}
                  </span>
                  <button
                    onClick={() => setQty(l.variant_id, l.qty + 1)}
                    className="iconbtn flex size-6 items-center justify-center rounded-md border border-border text-text-2"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                <span className="w-16 flex-none text-right text-[12.5px] font-semibold text-foreground">
                  {fmtUSD(l.qty * l.price)}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="flex-none border-t border-border p-4">
          <div className="flex flex-col gap-1.5 text-[12.5px]">
            <Row label="Subtotal" value={fmtUSD(subtotal)} />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-text-2">
                Descuento
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPct}
                  onChange={(e) =>
                    setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value))))
                  }
                  className="h-6 w-12 rounded-md border border-border bg-surface-2 px-1.5 text-center text-[11.5px] outline-none"
                />
                %
              </span>
              <span className="text-foreground">−{fmtUSD(discount)}</span>
            </div>
            <Row label="IVA (16%)" value={fmtUSD(tax)} />
          </div>

          <div className="mt-2.5 flex items-end justify-between border-t border-border pt-2.5">
            <span className="text-[14px] font-bold text-foreground">Total</span>
            <div className="text-right">
              <div className="text-[19px] font-bold tracking-tight text-foreground">
                {fmtUSD(total)}
              </div>
              <div className="text-[11.5px] text-text-3">{fmtVES(total * rate)}</div>
            </div>
          </div>

          <div className="mt-3 text-[11px] font-semibold tracking-wide text-text-3 uppercase">
            Método de pago
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {realMethods.map((m) => (
              <button
                key={m.name}
                onClick={() => {
                  setSelectedMethod(m.name);
                  setMixed(null);
                  setCashea(null);
                  setSingleReference("");
                }}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition",
                  !mixed && !cashea && selectedMethod === m.name
                    ? "bg-brand-soft text-brand"
                    : "border border-border bg-card text-text-2 hover:bg-[var(--hover)]",
                )}
              >
                {m.name}
                <span className="ml-1 text-[9.5px] opacity-60">{m.currency}</span>
              </button>
            ))}
            {hasMixto && (
              <button
                onClick={() => setMixedOpen(true)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition",
                  mixed
                    ? "bg-brand-soft text-brand"
                    : "border border-border bg-card text-text-2 hover:bg-[var(--hover)]",
                )}
              >
                Mixto
              </button>
            )}
            {hasCashea && (
              <button
                onClick={() => setCasheaOpen(true)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition",
                  cashea
                    ? "bg-brand-soft text-brand"
                    : "border border-border bg-card text-text-2 hover:bg-[var(--hover)]",
                )}
              >
                Cashea
              </button>
            )}
          </div>

          {/* Referencia para método único que la requiere */}
          {!mixed && !cashea && selectedPm?.requires_reference && (
            <input
              value={singleReference}
              onChange={(e) => setSingleReference(e.target.value)}
              placeholder={`N° de referencia (${selectedPm.name})`}
              className="mt-2 h-9 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-[12.5px] outline-none"
            />
          )}
          {/* Conversión para método único en VES */}
          {!mixed && !cashea && selectedPm?.currency === "VES" && (
            <p className="mt-1.5 text-[11px] text-text-3">
              A cobrar: <strong className="text-foreground">{fmtVES(total * rate)}</strong>
            </p>
          )}

          {/* Resumen de pago mixto */}
          {mixed && (
            <div className="mt-2 rounded-[10px] border border-border bg-surface-2 p-2.5 text-[11.5px]">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-foreground">Pago mixto</span>
                <button
                  onClick={() => setMixedOpen(true)}
                  className="flex items-center gap-1 text-brand"
                >
                  <Pencil className="size-3" /> Editar
                </button>
              </div>
              {mixed.map((p, i) => (
                <div key={i} className="flex justify-between text-text-2">
                  <span>
                    {p.method} {p.reference ? `· ${p.reference}` : ""}
                  </span>
                  <span>{fmtByCurrency(p.amount, p.currency, rate)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium text-foreground">
                <span>Cubierto</span>
                <span
                  className={
                    cents(mixedPaidUsd) === cents(total) ? "text-success" : "text-warning"
                  }
                >
                  {fmtUSD(mixedPaidUsd)} / {fmtUSD(total)}
                </span>
              </div>
            </div>
          )}

          {/* Resumen de pago con Cashea */}
          {cashea && (
            <div className="mt-2 rounded-[10px] border border-border bg-surface-2 p-2.5 text-[11.5px]">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-foreground">
                  Cashea {cashea.channel === "online" ? "Online" : "Tienda"} · ref{" "}
                  {cashea.reference}
                </span>
                <button
                  onClick={() => setCasheaOpen(true)}
                  className="flex items-center gap-1 text-brand"
                >
                  <Pencil className="size-3" /> Editar
                </button>
              </div>
              {cashea.initial.map((p, i) => (
                <div key={i} className="flex justify-between text-text-2">
                  <span>
                    Inicial · {p.method} {p.reference ? `· ${p.reference}` : ""}
                  </span>
                  <span>{fmtByCurrency(p.amount, p.currency, rate)}</span>
                </div>
              ))}
              {cashea.initial.length === 0 && (
                <div className="flex justify-between text-text-2">
                  <span>Inicial</span>
                  <span>{fmtUSD(0)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium text-warning">
                <span>Financia Cashea (por cobrar)</span>
                <span>{fmtUSD(cashea.financed)}</span>
              </div>
            </div>
          )}

          <Button
            onClick={complete}
            disabled={pending || lines.length === 0}
            className="mt-3 h-11 w-full text-[14px] font-bold"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : customer ? (
              <>Cobrar {fmtUSD(total)}</>
            ) : (
              "Selecciona un cliente"
            )}
          </Button>
          <button
            onClick={saveDraftNow}
            disabled={pending || lines.length === 0}
            className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-border text-[12.5px] font-medium text-text-2 disabled:opacity-50"
          >
            <Save className="size-3.5" /> Guardar borrador
          </button>
        </div>
      </div>

      <CustomerDialog
        open={custOpen}
        onOpenChange={setCustOpen}
        customers={customers}
        onSelect={(c) => {
          setCustomer(c);
          setCustOpen(false);
        }}
      />

      <MixedPaymentModal
        open={mixedOpen}
        onOpenChange={setMixedOpen}
        methods={realMethods}
        rate={rate}
        total={total}
        initial={mixed}
        onConfirm={(lines2) => {
          setMixed(lines2);
          setCashea(null);
          setMixedOpen(false);
        }}
      />

      <CasheaPaymentModal
        open={casheaOpen}
        onOpenChange={setCasheaOpen}
        methods={realMethods}
        rate={rate}
        total={total}
        initial={cashea}
        onConfirm={(draft) => {
          setCashea(draft);
          setMixed(null);
          setCasheaOpen(false);
        }}
      />

      <DraftsModal
        open={draftsOpen}
        onOpenChange={setDraftsOpen}
        drafts={drafts}
        onRestore={restoreDraft}
        onDelete={deleteDraft}
      />

      <InvoiceModal
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        data={lastSale}
      />

      <SaleCompletedModal
        open={saleCompleteOpen}
        onOpenChange={setSaleCompleteOpen}
        data={lastSale}
        onPrintInvoice={() => {
          setSaleCompleteOpen(false);
          setInvoiceOpen(true);
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-2">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

// ───────────────────────── Cliente (buscar por cédula / alta inline) ─────────────────────────

function CustomerDialog({
  open,
  onOpenChange,
  customers,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customers: PosCustomer[];
  onSelect: (c: PosCustomer | null) => void;
}) {
  const [doc, setDoc] = useState("");
  const [searching, setSearching] = useState(false);
  // undefined = sin buscar, null = no encontrado
  const [found, setFound] = useState<PosCustomer | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);

  function reset() {
    setDoc("");
    setFound(undefined);
    setName("");
    setPhone("");
    setEmail("");
  }

  async function search() {
    const d = doc.trim();
    if (!d) return toast.error("Ingresa el documento o cédula.");
    setSearching(true);
    const c = await findCustomerByDocument(d);
    setSearching(false);
    if (c) {
      setFound({ id: c.id, name: c.name, document: c.document, segment: c.segment });
    } else {
      setFound(null);
      setName("");
    }
  }

  async function create() {
    if (!name.trim()) return toast.error("El nombre es obligatorio.");
    setCreating(true);
    const res = await createPosCustomer({
      name,
      document: doc,
      phone,
      email,
    });
    setCreating(false);
    if (res.error || !res.customer) return toast.error(res.error ?? "No se pudo crear.");
    onSelect({
      id: res.customer.id,
      name: res.customer.name,
      document: res.customer.document,
      segment: res.customer.segment,
    });
    reset();
    toast.success("Cliente registrado y seleccionado");
  }

  const byName = customers
    .filter((c) => c.name.toLowerCase().includes(name.toLowerCase()) && found === undefined)
    .slice(0, 6);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Cliente</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="pos-doc" className="mb-1.5 block">
                Documento / Cédula
              </Label>
              <Input
                id="pos-doc"
                value={doc}
                onChange={(e) => {
                  setDoc(e.target.value);
                  setFound(undefined);
                }}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="Ej. V-12345678 / J-12345678-9"
              />
            </div>
            <Button type="button" onClick={search} disabled={searching}>
              {searching ? <Loader2 className="size-4 animate-spin" /> : "Buscar"}
            </Button>
          </div>

          {found && (
            <div className="rounded-[10px] border border-border bg-surface-2 p-3">
              <div className="text-[13px] font-semibold text-foreground">{found.name}</div>
              <div className="text-[12px] text-text-3">
                {found.document ?? "—"} · {found.segment}
              </div>
              <Button
                type="button"
                className="mt-2 w-full"
                onClick={() => {
                  onSelect(found);
                  reset();
                }}
              >
                Usar este cliente
              </Button>
            </div>
          )}

          {found === null && (
            <div className="rounded-[10px] border border-warning/40 bg-warning-soft p-3">
              <p className="mb-2 text-[12.5px] text-warning">
                No existe un cliente con ese documento. Regístralo para continuar.
              </p>
              <div className="flex flex-col gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre completo *"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Teléfono"
                  />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Correo"
                  />
                </div>
                <Button type="button" onClick={create} disabled={creating}>
                  {creating && <Loader2 className="size-4 animate-spin" />} Registrar y usar
                </Button>
              </div>
            </div>
          )}

          {/* Búsqueda rápida por nombre */}
          {found === undefined && (
            <div>
              <Label htmlFor="pos-name" className="mb-1.5 block">
                Buscar por nombre
              </Label>
              <Input
                id="pos-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Escribe un nombre…"
              />
              <div className="mt-2 max-h-[220px] overflow-y-auto">
                {byName.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelect(c);
                      reset();
                    }}
                    className="tr-row flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-text-2">
                      {initials(c.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {c.name}
                      </div>
                      <div className="truncate text-[11px] text-text-3">
                        {c.document ?? "—"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Pago mixto ─────────────────────────

type DraftPayLine = { method: string; amount: string; reference: string };

function MixedPaymentModal({
  open,
  onOpenChange,
  methods,
  rate,
  total,
  initial,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  methods: PaymentMethodOption[];
  rate: number;
  total: number;
  initial: SalePaymentInput[] | null;
  onConfirm: (lines: SalePaymentInput[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[720px] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Pago mixto · Total {fmtUSD(total)}</DialogTitle>
        </DialogHeader>
        {open && (
          <MixedPaymentForm
            methods={methods}
            rate={rate}
            total={total}
            initial={initial}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MixedPaymentForm({
  methods,
  rate,
  total,
  initial,
  onCancel,
  onConfirm,
}: {
  methods: PaymentMethodOption[];
  rate: number;
  total: number;
  initial: SalePaymentInput[] | null;
  onCancel: () => void;
  onConfirm: (lines: SalePaymentInput[]) => void;
}) {
  const [rows, setRows] = useState<DraftPayLine[]>(() =>
    initial && initial.length
      ? initial.map((p) => ({
          method: p.method,
          amount: String(p.amount),
          reference: p.reference ?? "",
        }))
      : [{ method: methods[0]?.name ?? "", amount: "", reference: "" }],
  );

  const pmOf = (name: string) => methods.find((m) => m.name === name);
  const isValidAmount = (amount: string) => {
    const value = amount.trim();
    return !value || moneyPattern.test(value);
  };
  const toUsd = (r: DraftPayLine) => {
    if (!isValidAmount(r.amount)) return 0;
    const pm = pmOf(r.method);
    const amt = Number(r.amount.trim()) || 0;
    if (!pm) return 0;
    return round2(pm.currency === "VES" ? (rate ? amt / rate : 0) : amt);
  };
  const paidUsd = rows.reduce((a, r) => a + toUsd(r), 0);
  const remainingCents = cents(total) - cents(paidUsd);
  const remaining = centsToMoney(remainingCents);
  const remainingVes = round2(remaining * rate);

  function update(i: number, patch: Partial<DraftPayLine>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { method: methods[0]?.name ?? "", amount: "", reference: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }
  /** Rellena el monto de una fila con lo que falta (en su moneda). */
  function fillRemaining(i: number) {
    const pm = pmOf(rows[i].method);
    if (!pm) return;
    const restUsd = Math.max(0, remainingCents / 100 + toUsd(rows[i])); // ignora el monto actual de esta fila
    const native = pm.currency === "VES" ? round2(restUsd * rate) : round2(restUsd);
    update(i, { amount: formatAmountInput(native) });
  }

  function confirm() {
    const lines: SalePaymentInput[] = [];
    for (const r of rows) {
      const pm = pmOf(r.method);
      const amountText = r.amount.trim();
      if (amountText && !moneyPattern.test(amountText)) {
        toast.error(`El monto de ${pm?.name ?? "la fila"} debe tener máximo 2 decimales.`);
        return;
      }
      const amount = Number(amountText) || 0;
      if (!pm || amount <= 0) continue;
      if (pm.requires_reference && !r.reference.trim()) {
        toast.error(`Falta la referencia de ${pm.name}.`);
        return;
      }
      lines.push({
        method: pm.name,
        currency: pm.currency,
        amount: round2(amount),
        amount_usd: round2(toUsd(r)),
        reference: r.reference.trim() || null,
      });
    }
    if (!lines.length) return toast.error("Agrega al menos un pago con monto.");
    const sumUsd = lines.reduce((a, p) => a + p.amount_usd, 0);
    const diffCents = cents(total) - cents(sumUsd);
    if (diffCents !== 0) {
      return toast.error(
        diffCents > 0
          ? `Falta por cubrir ${fmtUSD(centsToMoney(diffCents))}.`
          : `El pago excede el total por ${fmtUSD(centsToMoney(diffCents))}.`,
      );
    }
    onConfirm(lines);
  }

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => {
            const pm = pmOf(r.method);
            return (
              <div key={i} className="min-w-0 rounded-[10px] border border-border p-3">
                <div className="grid min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(150px,190px)_minmax(0,1fr)_56px_auto]">
                  <Select value={r.method} onValueChange={(v) => update(i, { method: v })}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((m) => (
                        <SelectItem key={m.name} value={m.name}>
                          {m.name} ({m.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={r.amount}
                    onChange={(e) => update(i, { amount: e.target.value })}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && moneyPattern.test(value)) {
                        update(i, { amount: formatAmountInput(Number(value)) });
                      }
                    }}
                    placeholder={pm?.currency === "VES" ? "Monto Bs." : "Monto $"}
                    className="h-10"
                  />
                  <button
                    type="button"
                    onClick={() => fillRemaining(i)}
                    className="iconbtn h-10 rounded-md border border-border px-2 text-[11px] text-text-2"
                    title="Rellenar con lo que falta"
                  >
                    Resto
                  </button>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="iconbtn flex size-10 items-center justify-center rounded-md text-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_210px] sm:items-center">
                  <span className="min-w-0 text-[11px] text-text-3">
                    {isValidAmount(r.amount) ? (
                      <>
                        ≈ {fmtUSD(toUsd(r))}
                        {pm?.currency === "VES" ? ` · ${fmtVES(Number(r.amount) || 0)}` : ""}
                      </>
                    ) : (
                      <span className="text-danger">Monto inválido: máximo 2 decimales</span>
                    )}
                  </span>
                  {pm?.requires_reference && (
                    <Input
                      value={r.reference}
                      onChange={(e) => update(i, { reference: e.target.value })}
                      placeholder="N° referencia"
                      className="h-8 w-full text-[12px]"
                    />
                  )}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            className="flex items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border py-2 text-[12.5px] font-medium text-text-2 hover:bg-[var(--hover)]"
          >
            <Plus className="size-4" /> Agregar método
          </button>

          <div className="flex items-center justify-between rounded-[10px] bg-surface-2 px-3 py-2.5 text-[13px]">
            <span className="font-semibold text-foreground">Cubierto {fmtUSD(paidUsd)}</span>
            <span
              className={cn(
                "flex flex-col items-end text-right font-semibold",
                remainingCents === 0 ? "text-success" : "text-warning",
              )}
            >
              <span>
                {remainingCents === 0
                  ? "Completo"
                  : remainingCents > 0
                    ? `Falta ${fmtUSD(remaining)}`
                    : `Excede ${fmtUSD(remaining)}`}
              </span>
              {remainingCents !== 0 && (
                <span className="text-[11px] font-medium leading-tight text-text-2">
                  {fmtVES(remainingVes)}
                </span>
              )}
            </span>
          </div>
        </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" onClick={confirm}>
          Confirmar pago
        </Button>
      </DialogFooter>
    </>
  );
}

// ───────────────────────── Pago con Cashea ─────────────────────────

function CasheaPaymentModal({
  open,
  onOpenChange,
  methods,
  rate,
  total,
  initial,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  methods: PaymentMethodOption[];
  rate: number;
  total: number;
  initial: CasheaDraft | null;
  onConfirm: (draft: CasheaDraft) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[720px] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Pago con Cashea · Total {fmtUSD(total)}</DialogTitle>
        </DialogHeader>
        {open && (
          <CasheaPaymentForm
            methods={methods}
            rate={rate}
            total={total}
            initial={initial}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CasheaPaymentForm({
  methods,
  rate,
  total,
  initial,
  onCancel,
  onConfirm,
}: {
  methods: PaymentMethodOption[];
  rate: number;
  total: number;
  initial: CasheaDraft | null;
  onCancel: () => void;
  onConfirm: (draft: CasheaDraft) => void;
}) {
  const [rows, setRows] = useState<DraftPayLine[]>(() =>
    initial && initial.initial.length
      ? initial.initial.map((p) => ({
          method: p.method,
          amount: String(p.amount),
          reference: p.reference ?? "",
        }))
      : [{ method: methods[0]?.name ?? "", amount: "", reference: "" }],
  );
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [channel, setChannel] = useState<"tienda" | "online">(
    initial?.channel ?? "tienda",
  );

  const pmOf = (name: string) => methods.find((m) => m.name === name);
  const isValidAmount = (amount: string) => {
    const value = amount.trim();
    return !value || moneyPattern.test(value);
  };
  const toUsd = (r: DraftPayLine) => {
    if (!isValidAmount(r.amount)) return 0;
    const pm = pmOf(r.method);
    const amt = Number(r.amount.trim()) || 0;
    if (!pm) return 0;
    return round2(pm.currency === "VES" ? (rate ? amt / rate : 0) : amt);
  };
  const initialUsd = round2(rows.reduce((a, r) => a + toUsd(r), 0));
  const financedCents = cents(total) - cents(initialUsd);
  const financed = centsToMoney(financedCents);

  function update(i: number, patch: Partial<DraftPayLine>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { method: methods[0]?.name ?? "", amount: "", reference: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function confirm() {
    if (!reference.trim()) return toast.error("Ingresa el número de orden de Cashea.");
    const lines: SalePaymentInput[] = [];
    for (const r of rows) {
      const pm = pmOf(r.method);
      const amountText = r.amount.trim();
      if (amountText && !moneyPattern.test(amountText)) {
        toast.error(`El monto de ${pm?.name ?? "la fila"} debe tener máximo 2 decimales.`);
        return;
      }
      const amount = Number(amountText) || 0;
      if (!pm || amount <= 0) continue;
      if (pm.requires_reference && !r.reference.trim()) {
        toast.error(`Falta la referencia de ${pm.name}.`);
        return;
      }
      lines.push({
        method: pm.name,
        currency: pm.currency,
        amount: round2(amount),
        amount_usd: round2(toUsd(r)),
        reference: r.reference.trim() || null,
      });
    }
    const initUsd = round2(lines.reduce((a, p) => a + p.amount_usd, 0));
    const fCents = cents(total) - cents(initUsd);
    if (fCents < 0) return toast.error("El inicial no puede superar el total.");
    if (fCents === 0)
      return toast.error("El inicial cubre el total; usa un método de pago normal.");
    onConfirm({
      initial: lines,
      reference: reference.trim(),
      financed: centsToMoney(fCents),
      channel,
    });
  }

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <div>
          <Label className="text-[12px] text-text-2">Canal</Label>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {(["tienda", "online"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={cn(
                  "h-10 rounded-[10px] border text-[12.5px] font-medium transition",
                  channel === c
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border bg-card text-text-2 hover:bg-[var(--hover)]",
                )}
              >
                {c === "tienda" ? "Tienda" : "Online (marketplace)"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-[12px] text-text-2">N° de orden Cashea</Label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Referencia de la orden Cashea"
            className="mt-1 h-10"
          />
        </div>

        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
          Inicial cobrada en caja
        </div>

        {rows.map((r, i) => {
          const pm = pmOf(r.method);
          return (
            <div key={i} className="min-w-0 rounded-[10px] border border-border p-3">
              <div className="grid min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(150px,190px)_minmax(0,1fr)_auto]">
                <Select value={r.method} onValueChange={(v) => update(i, { method: v })}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {methods.map((m) => (
                      <SelectItem key={m.name} value={m.name}>
                        {m.name} ({m.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={r.amount}
                  onChange={(e) => update(i, { amount: e.target.value })}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && moneyPattern.test(value)) {
                      update(i, { amount: formatAmountInput(Number(value)) });
                    }
                  }}
                  placeholder={pm?.currency === "VES" ? "Monto Bs." : "Monto $"}
                  className="h-10"
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="iconbtn flex size-10 items-center justify-center rounded-md text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_210px] sm:items-center">
                <span className="min-w-0 text-[11px] text-text-3">
                  {isValidAmount(r.amount) ? (
                    <>
                      ≈ {fmtUSD(toUsd(r))}
                      {pm?.currency === "VES" ? ` · ${fmtVES(Number(r.amount) || 0)}` : ""}
                    </>
                  ) : (
                    <span className="text-danger">Monto inválido: máximo 2 decimales</span>
                  )}
                </span>
                {pm?.requires_reference && (
                  <Input
                    value={r.reference}
                    onChange={(e) => update(i, { reference: e.target.value })}
                    placeholder="N° referencia"
                    className="h-8 w-full text-[12px]"
                  />
                )}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addRow}
          className="flex items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border py-2 text-[12.5px] font-medium text-text-2 hover:bg-[var(--hover)]"
        >
          <Plus className="size-4" /> Agregar método a la inicial
        </button>

        <div className="rounded-[10px] bg-surface-2 px-3 py-2.5 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-text-2">Inicial cobrada</span>
            <span className="font-semibold text-foreground">{fmtUSD(initialUsd)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
            <span className="font-semibold text-foreground">
              Financia Cashea (por cobrar)
            </span>
            <span
              className={cn(
                "flex flex-col items-end text-right font-semibold",
                financedCents > 0 ? "text-warning" : "text-danger",
              )}
            >
              <span>{fmtUSD(financed)}</span>
              {financedCents > 0 && (
                <span className="text-[11px] font-medium leading-tight text-text-2">
                  {fmtVES(round2(financed * rate))}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" onClick={confirm}>
          Confirmar Cashea
        </Button>
      </DialogFooter>
    </>
  );
}

// ───────────────────────── Borradores ─────────────────────────

function DraftsModal({
  open,
  onOpenChange,
  drafts,
  onRestore,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  drafts: PosDraft[];
  onRestore: (d: PosDraft) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Borradores guardados</DialogTitle>
        </DialogHeader>
        <div className="max-h-[420px] overflow-y-auto">
          {drafts.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-text-3">
              No hay borradores guardados.
            </p>
          ) : (
            drafts.map((d) => {
              const total = d.lines.reduce((a, l) => a + l.qty * l.price, 0);
              const count = d.lines.reduce((a, l) => a + l.qty, 0);
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-2.5 border-b border-border px-1 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-foreground">
                      {d.label}
                    </div>
                    <div className="text-[11.5px] text-text-3">
                      {count} art. · ~{fmtUSD(total)} ·{" "}
                      {new Date(d.createdAt).toLocaleString("es-VE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <Button type="button" size="sm" onClick={() => onRestore(d)}>
                    Restaurar
                  </Button>
                  <button
                    type="button"
                    onClick={() => onDelete(d.id)}
                    className="iconbtn flex size-8 items-center justify-center rounded-md text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Factura post-venta ─────────────────────────

function SaleCompletedModal({
  open,
  onOpenChange,
  data,
  onPrintInvoice,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: InvoiceData | null;
  onPrintInvoice: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[440px] overflow-hidden p-0">
        <div className="flex flex-col items-center px-7 py-8 text-center">
          <div className="relative flex size-20 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-success-soft animate-ping motion-reduce:animate-none" />
            <span className="relative flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="size-9" />
            </span>
          </div>
          <DialogHeader className="mt-4 items-center text-center">
            <DialogTitle>Venta completada</DialogTitle>
          </DialogHeader>
          <div className="mt-2 text-[13px] text-text-2">
            {data?.invoiceNumber ? `Factura ${data.invoiceNumber}` : "La venta fue registrada."}
          </div>
          {data ? (
            <div className="mt-3 rounded-[10px] bg-surface-2 px-4 py-2">
              <div className="text-[12px] text-text-3">Total cobrado</div>
              <div className="text-[18px] font-bold text-foreground">{fmtUSD(data.total)}</div>
              <div className="text-[11.5px] text-text-3">
                {fmtVES(data.total_ves ?? data.total * data.rate)}
              </div>
            </div>
          ) : null}
          <div className="mt-6 grid w-full grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button type="button" onClick={onPrintInvoice}>
              <FileText className="size-4" /> Imprimir factura
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceModal({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: InvoiceData | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const viewport = useSyncExternalStore(
    subscribeViewport,
    viewportSnapshot,
    viewportServerSnapshot,
  );
  const [viewportWidth = 1180, viewportHeight = 820] = viewport
    .split("x")
    .map((value) => Number(value));
  const estimatedHeight = estimateInvoiceHeight(data);
  const dialogWidth = Math.max(320, Math.min(1180, viewportWidth - 32));
  const availableWidth = Math.max(296, dialogWidth - 24);
  const availableHeight = Math.max(320, viewportHeight - 130);
  const previewScale = Math.max(
    0.35,
    Math.min(1.18, availableWidth / invoicePreviewWidth, availableHeight / estimatedHeight),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="grid h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)] xl:max-w-[1180px]"
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b border-border px-5 py-3">
          <DialogTitle>Venta registrada {data ? `· ${data.invoiceNumber}` : ""}</DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => printNode(ref.current, `Factura ${data?.invoiceNumber ?? ""}`)}
            >
              <FileText className="size-4" /> Imprimir factura
            </Button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="iconbtn flex size-8 items-center justify-center rounded-md text-text-3"
            >
              <X className="size-4" />
            </button>
          </div>
        </DialogHeader>
        <div className="flex min-h-0 items-center justify-center overflow-hidden bg-surface-2 p-3">
          {data && (
            <div
              className="relative"
              style={{
                width: invoicePreviewWidth * previewScale,
                height: estimatedHeight * previewScale,
              }}
            >
              <div
                style={{
                  width: invoicePreviewWidth,
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top left",
                }}
              >
                <InvoiceDocument ref={ref} data={data} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
