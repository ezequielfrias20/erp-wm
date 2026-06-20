"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Store,
  UserRound,
  Loader2,
  Trash2,
} from "lucide-react";
import { checkout, type CheckoutItem } from "@/app/(app)/ventas/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fmtUSD, fmtVES, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PosProduct = {
  variant_id: string;
  sku: string;
  product_name: string;
  category: string | null;
  price: number;
  cost: number;
  color_hex: string | null;
  stock: number;
};
export type PosCustomer = {
  id: string;
  name: string;
  document: string | null;
  segment: string;
};

type CartLine = PosProduct & { qty: number };

export function PosView({
  products,
  customers,
  paymentMethods,
  branch,
  rate,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  paymentMethods: string[];
  branch: { id: string; city: string } | null;
  rate: number;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("Todos");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [custOpen, setCustOpen] = useState(false);
  const [custQuery, setCustQuery] = useState("");
  const [payment, setPayment] = useState(paymentMethods[0] ?? "Efectivo USD");
  const [discountPct, setDiscountPct] = useState(0);
  const [pending, startTransition] = useTransition();

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
          p.sku.toLowerCase().includes(q),
      );
    return list;
  }, [products, cat, query]);

  const lines = Object.values(cart);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const discount = (subtotal * discountPct) / 100;
  const taxbase = subtotal - discount;
  const tax = taxbase * 0.16;
  const total = taxbase + tax;
  const count = lines.reduce((a, l) => a + l.qty, 0);

  function add(p: PosProduct) {
    setCart((c) => {
      const existing = c[p.variant_id];
      const qty = (existing?.qty ?? 0) + 1;
      if (qty > p.stock) {
        toast.warning(`Solo hay ${p.stock} en stock de ${p.product_name}`);
        return c;
      }
      return { ...c, [p.variant_id]: { ...p, qty } };
    });
  }
  function setQty(id: string, qty: number) {
    setCart((c) => {
      if (qty <= 0) {
        const { [id]: _, ...rest } = c;
        return rest;
      }
      const line = c[id];
      if (line && qty > line.stock) return c;
      return { ...c, [id]: { ...line, qty } };
    });
  }

  function complete(status: "Pagada" | "Pendiente") {
    if (!branch) return toast.error("No hay sucursal seleccionada.");
    if (lines.length === 0) return toast.error("El ticket está vacío.");
    const items: CheckoutItem[] = lines.map((l) => ({
      variant_id: l.variant_id,
      description: l.product_name,
      quantity: l.qty,
      unit_price: l.price,
      cost: l.cost,
    }));
    startTransition(async () => {
      const res = await checkout({
        branch_id: branch.id,
        customer_id: customer?.id ?? null,
        payment_method: payment,
        discount_pct: discountPct,
        rate,
        items,
        status,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success(
          status === "Pagada"
            ? `Venta ${res.invoice} registrada`
            : `Borrador ${res.invoice} guardado`,
        );
        setCart({});
        setCustomer(null);
        setDiscountPct(0);
      }
    });
  }

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(custQuery.toLowerCase()),
  );

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_380px]">
      {/* Catalog */}
      <div className="flex flex-col overflow-hidden">
        <div className="px-[30px] pt-[22px]">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">
            Punto de venta
          </h1>
          <p className="mt-0.5 text-[12.5px] text-text-2">
            Sucursal {branch?.city ?? "—"} · Caja 01 · tasa {fmtVES(rate)}
          </p>

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

        <div className="flex-1 overflow-y-auto px-[30px] py-4">
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
                  className="hoverlift flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-card-sm"
                >
                  <div
                    className="flex h-24 items-center justify-center text-[18px] font-bold text-white"
                    style={{
                      background: `linear-gradient(140deg, ${p.color_hex ?? "#0EA5E9"}, color-mix(in srgb, ${p.color_hex ?? "#0EA5E9"} 70%, #000))`,
                    }}
                  >
                    {initials(p.product_name)}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="text-[10.5px] font-medium tracking-wide text-text-3 uppercase">
                      {p.category}
                    </div>
                    <div className="line-clamp-2 text-[12.5px] font-semibold text-foreground">
                      {p.product_name}
                    </div>
                    <div className="mt-auto flex items-end justify-between pt-2">
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
      <div className="flex flex-col border-l border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <ShoppingCart className="size-[18px]" />
            </span>
            <div>
              <div className="text-[14px] font-bold text-foreground">
                Ticket de venta
              </div>
              <div className="text-[11.5px] text-text-3">{count} artículos</div>
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
              {customer?.name ?? "Cliente general"}
            </div>
            <div className="truncate text-[11.5px] text-text-3">
              {customer?.document ?? "Sin documento"}
            </div>
          </div>
          <span className="text-[12px] font-medium text-brand">Cambiar</span>
        </button>

        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <ShoppingCart className="size-8 text-text-3" />
              <div className="text-[13px] font-semibold text-foreground">
                Carrito vacío
              </div>
              <div className="text-[12px] text-text-3">
                Toca un producto para agregarlo
              </div>
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
                  <div className="truncate text-[12.5px] font-medium text-foreground">
                    {l.product_name}
                  </div>
                  <div className="text-[11px] text-text-3">{fmtUSD(l.price)} c/u</div>
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

        <div className="border-t border-border p-4">
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
                  onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value))))}
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
            {paymentMethods.map((m) => (
              <button
                key={m}
                onClick={() => setPayment(m)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition",
                  payment === m
                    ? "bg-brand-soft text-brand"
                    : "border border-border bg-card text-text-2 hover:bg-[var(--hover)]",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <Button
            onClick={() => complete("Pagada")}
            disabled={pending || lines.length === 0}
            className="mt-3 h-11 w-full text-[14px] font-bold"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>Cobrar {fmtUSD(total)}</>
            )}
          </Button>
          <button
            onClick={() => complete("Pendiente")}
            disabled={pending || lines.length === 0}
            className="mt-2 h-9 w-full rounded-[10px] border border-border text-[12.5px] font-medium text-text-2 disabled:opacity-50"
          >
            Guardar borrador
          </button>
        </div>
      </div>

      <Dialog open={custOpen} onOpenChange={setCustOpen}>
        <DialogContent className="max-w-[440px] p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>Seleccionar cliente</DialogTitle>
          </DialogHeader>
          <div className="px-5">
            <input
              value={custQuery}
              onChange={(e) => setCustQuery(e.target.value)}
              placeholder="Buscar cliente…"
              className="h-[38px] w-full rounded-[10px] border border-border bg-surface-2 px-3 text-[13px] outline-none"
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto p-2">
            <button
              onClick={() => {
                setCustomer(null);
                setCustOpen(false);
              }}
              className="tr-row flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-text-2">
                <UserRound className="size-4" />
              </span>
              <span className="text-[13px] font-medium text-foreground">
                Cliente general
              </span>
            </button>
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCustomer(c);
                  setCustOpen(false);
                }}
                className="tr-row flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left"
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
        </DialogContent>
      </Dialog>
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
