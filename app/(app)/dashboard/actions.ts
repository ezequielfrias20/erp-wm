"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getSaleDetail, type SaleDetail } from "@/lib/queries/reports";
import type { InvoiceCompany } from "@/components/factura/invoice-template";

export type SaleInvoicePayload = { detail: SaleDetail; company: InvoiceCompany };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Factura de una venta para reimprimirla desde el home (la cajera no tiene acceso
 * a Reportes). Basta con ser miembro activo: es la misma lectura que el RLS de
 * `wm.sales` ya permite a cualquier miembro.
 */
export async function loadSaleInvoice(id: string): Promise<SaleInvoicePayload | null> {
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();
  const [detail, settingsRes] = await Promise.all([
    getSaleDetail(id),
    supabase
      .from("settings")
      .select("company_name, rif, fiscal_address, phone, logo_url")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  if (!detail) return null;

  const s = settingsRes.data;
  return {
    detail,
    company: {
      name: s?.company_name ?? null,
      rif: s?.rif ?? null,
      address: s?.fiscal_address ?? null,
      phone: s?.phone ?? null,
      logoUrl: s?.logo_url ?? null,
    },
  };
}
