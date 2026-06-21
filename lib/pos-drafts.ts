/**
 * Borradores de venta del POS, persistidos en localStorage (por navegador/equipo).
 * Guardan el carrito, el cliente y el descuento para retomar una venta luego.
 */

export type PosDraftCustomer = {
  id: string;
  name: string;
  document: string | null;
  segment: string;
} | null;

export type PosDraftLine = {
  variant_id: string;
  sku: string;
  product_name: string;
  category: string | null;
  price: number;
  cost: number;
  color_hex: string | null;
  stock: number;
  qty: number;
};

export type PosDraft = {
  id: string;
  createdAt: string;
  branchId: string | null;
  label: string;
  customer: PosDraftCustomer;
  discountPct: number;
  lines: PosDraftLine[];
};

const KEY = "wm:pos:drafts";
const EMPTY: PosDraft[] = [];

// Cache para useSyncExternalStore: la snapshot debe ser estable entre llamadas
// mientras el localStorage no cambie (si no, React entra en bucle de render).
let cache: PosDraft[] = EMPTY;
let cacheRaw: string | null = null;
const listeners = new Set<() => void>();

function read(): PosDraft[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(KEY);
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as PosDraft[]) : EMPTY;
    cache = Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

export function loadDrafts(): PosDraft[] {
  return read();
}

function persist(drafts: PosDraft[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(drafts));
  cacheRaw = null; // fuerza re-lectura en la próxima snapshot
  listeners.forEach((l) => l());
}

export function saveDraft(draft: PosDraft): PosDraft[] {
  const drafts = read().filter((d) => d.id !== draft.id);
  drafts.unshift(draft);
  persist(drafts);
  return drafts;
}

export function removeDraft(id: string): PosDraft[] {
  const drafts = read().filter((d) => d.id !== id);
  persist(drafts);
  return drafts;
}

export function newDraftId(): string {
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── API para useSyncExternalStore ──
export function subscribeDrafts(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined" && listeners.size === 0)
      window.removeEventListener("storage", onStorage);
  };
}
function onStorage(e: StorageEvent) {
  if (e.key === KEY) {
    cacheRaw = null;
    listeners.forEach((l) => l());
  }
}
export function draftsSnapshot(): PosDraft[] {
  return read();
}
export function draftsServerSnapshot(): PosDraft[] {
  return EMPTY;
}
