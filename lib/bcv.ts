/** BCV (Banco Central de Venezuela) official USD rate via dolarapi.com. */

export type BcvRate = {
  rate: number;
  updatedAt: string;
  source: string;
};

type CurrentRateResponse = {
  fuente?: string | null;
  promedio?: number | null;
  venta?: number | null;
  fechaActualizacion?: string | null;
};

type HistoricRateResponse = {
  fuente?: string | null;
  promedio?: number | null;
  venta?: number | null;
  fecha?: string | null;
};

type RateCandidate = {
  rate: number;
  date: string;
  updatedAt: string;
  source: "actual" | "histórico";
};

const CURRENT_ENDPOINT =
  process.env.NEXT_PUBLIC_BCV_API ?? "https://ve.dolarapi.com/v1/dolares/oficial";
const HISTORIC_ENDPOINT =
  process.env.NEXT_PUBLIC_BCV_HISTORIC_API ??
  "https://ve.dolarapi.com/v1/historicos/dolares/oficial";

/** Fallback used if the API is unreachable (kept reasonable; UI shows "—" age then). */
export const BCV_FALLBACK = 113;

function dateKey(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function rateValue(data: { promedio?: number | null; venta?: number | null }): number | null {
  const value = data.promedio ?? data.venta ?? null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function currentCandidate(data: CurrentRateResponse): RateCandidate | null {
  const rate = rateValue(data);
  const date = dateKey(data.fechaActualizacion);
  if (rate == null || !date) return null;
  return {
    rate,
    date,
    updatedAt: data.fechaActualizacion ?? `${date}T00:00:00-04:00`,
    source: "actual",
  };
}

function historicCandidate(data: HistoricRateResponse[]): RateCandidate | null {
  if (!Array.isArray(data)) return null;
  const last = data.at(-1);
  if (!last) return null;
  const rate = rateValue(last);
  const date = dateKey(last.fecha);
  if (rate == null || !date) return null;
  return {
    rate,
    date,
    updatedAt: `${date}T00:00:00-04:00`,
    source: "histórico",
  };
}

export function resolveBcvRate(
  current: CurrentRateResponse | null,
  historic: HistoricRateResponse[] | null,
): BcvRate {
  const candidates = [
    current ? currentCandidate(current) : null,
    historic ? historicCandidate(historic) : null,
  ].filter(Boolean) as RateCandidate[];

  if (!candidates.length) {
    throw new Error("No hay tasa válida en dolarapi.");
  }

  const selected = candidates.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.rate - a.rate;
  })[0];

  return {
    rate: selected.rate,
    updatedAt: selected.updatedAt,
    source: `BCV (${selected.source})`,
  };
}

async function fetchJson<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Fetches the official USD rate, reconciling the current and historical dolarapi feeds. */
export async function fetchBcvRate(): Promise<BcvRate> {
  const [current, historic] = await Promise.all([
    fetchJson<CurrentRateResponse>(CURRENT_ENDPOINT),
    fetchJson<HistoricRateResponse[]>(HISTORIC_ENDPOINT),
  ]);

  return resolveBcvRate(current, historic);
}
