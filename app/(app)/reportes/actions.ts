"use server";

import { getSaleDetail, type SaleDetail } from "@/lib/queries/reports";

/** Carga el detalle completo de una venta (items, pagos, cliente) para Reportes. */
export async function loadSaleDetail(id: string): Promise<SaleDetail | null> {
  return getSaleDetail(id);
}
