import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/queries/session";
import { getProfileBranchScope } from "@/lib/branch";
import { isSameOrigin } from "@/lib/same-origin";
import { REQUEST_ID_RE } from "@/lib/sales/checkout-types";
import type { CheckoutInput, CheckoutResult } from "@/lib/sales/checkout-types";

/**
 * Registro de la venta del POS.
 *
 * Es un Route Handler y no una Server Action a propósito: el cobro necesita plazo
 * real y poder abortarse, y las Server Actions no dan ninguna de las dos cosas —una
 * que se cuelga congela la cola entera del router y con ella todo el POS. El porqué
 * completo está en `lib/sales/checkout-client.ts`.
 */

export const runtime = "nodejs";
// El cobro nunca se sirve de caché ni se comparte entre usuarios.
export const dynamic = "force-dynamic";

function json(status: number, body: CheckoutResult) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

/** Comprobaciones de forma. Las de negocio las hace `wm.create_sale` bajo RLS. */
function validate(input: CheckoutInput): string | null {
  if (!Array.isArray(input.items) || input.items.length === 0) return "El ticket está vacío.";
  if (!input.customer_id) return "Selecciona un cliente para cobrar la venta.";
  if (!input.seller_id) return "Selecciona el vendedor de la venta.";
  if (!Array.isArray(input.payments) || input.payments.length === 0) {
    return "Configura al menos un método de pago.";
  }
  if (!input.branch_id) return "No hay sucursal seleccionada.";
  if (!REQUEST_ID_RE.test(input.request_id ?? "")) return "Identificador de operación inválido.";
  return null;
}

export async function POST(request: Request) {
  if (
    !isSameOrigin({
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      forwardedHost: request.headers.get("x-forwarded-host"),
    })
  ) {
    return json(403, { error: "Petición rechazada por seguridad." });
  }

  let input: CheckoutInput;
  try {
    input = (await request.json()) as CheckoutInput;
  } catch {
    return json(400, { error: "No se pudo leer la solicitud de cobro." });
  }

  const invalid = validate(input);
  if (invalid) return json(400, { error: invalid });

  const session = await getSession();
  if (!session) return json(401, { error: "Debes iniciar sesión." });

  const assignedBranchId = getProfileBranchScope(session.profile);
  if (assignedBranchId && input.branch_id !== assignedBranchId) {
    return json(403, { error: "No puedes registrar ventas en otra sucursal." });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_sale", {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    p_payments: input.payments,
    p_discount_pct: input.discount_pct,
    p_rate: input.rate,
    p_items: input.items.map((item) => ({ ...item, request_id: input.request_id })),
    p_status: input.status ?? "Pagada",
    p_cashea: input.cashea ?? null,
    p_seller_id: input.seller_id,
  });

  if (error) return json(400, { error: error.message });
  if (!data) return json(502, { error: "No se recibió la venta registrada." });

  // Sólo se invalidan las vistas cuyos agregados persistidos cambiaron; el POS
  // actualiza su carrito y su stock por su cuenta al recibir esta respuesta.
  revalidatePath("/inventario");
  revalidatePath("/dashboard");
  revalidatePath("/reportes");
  revalidatePath("/cashea");

  return json(200, {
    invoice: data.invoice_number,
    saleId: data.id,
    createdAt: data.created_at,
  });
}
