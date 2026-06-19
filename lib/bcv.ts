/** BCV (Banco Central de Venezuela) official USD rate via dolarapi.com. */

export type BcvRate = {
  rate: number;
  updatedAt: string;
  source: string;
};

const ENDPOINT =
  process.env.NEXT_PUBLIC_BCV_API ?? "https://ve.dolarapi.com/v1/dolares/oficial";

/** Fallback used if the API is unreachable (kept reasonable; UI shows "—" age then). */
export const BCV_FALLBACK = 113;

/** Fetches the live BCV official rate. Revalidated hourly by the route handler. */
export async function fetchBcvRate(): Promise<BcvRate> {
  const res = await fetch(ENDPOINT, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`BCV API ${res.status}`);
  const data = (await res.json()) as {
    promedio?: number;
    venta?: number;
    fechaActualizacion?: string;
  };
  const rate = data.promedio ?? data.venta ?? BCV_FALLBACK;
  return {
    rate,
    updatedAt: data.fechaActualizacion ?? new Date().toISOString(),
    source: "BCV",
  };
}
