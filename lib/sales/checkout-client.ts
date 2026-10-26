import { ActionTimeoutError } from "@/lib/action-error";

import type { CheckoutInput, CheckoutResult } from "./checkout-types";

/**
 * Envía el cobro al servidor desde el navegador.
 *
 * **Por qué no es una Server Action.** Next serializa las Server Actions en una
 * única cola por router y no expone forma de abortar una petición en curso. Si el
 * POST de una acción se queda mudo —no responde ni falla—, `pending` de
 * `useTransition` nunca baja y, peor, ninguna acción posterior llega siquiera a
 * salir a la red: el POS entero (reintentar el cobro, buscar un cliente) queda
 * congelado hasta recargar la página. Medido en el navegador: cero POST tras el
 * cuelgue. Para el cobro de un punto de venta eso no es aceptable.
 *
 * Con un Route Handler y `fetch` recuperamos las tres cosas que faltaban: plazo
 * real, petición **abortable** y una cola que no comparte con nadie. Al vencer el
 * plazo la conexión se corta de verdad y el siguiente intento sale limpio.
 *
 * Reintentar es seguro: el POS conserva el `request_id` y `wm.create_sale` es
 * idempotente por `(user_id, request_id)`, así que si la venta sí se grabó y sólo
 * se perdió la respuesta, el reintento devuelve esa misma venta en vez de duplicarla.
 */

/** Techo de espera del cobro. Por encima del plazo de datos de Supabase (30 s),
 *  para que un fallo suyo produzca antes su propio mensaje, más preciso. */
export const CHECKOUT_TIMEOUT_MS = 35_000;

export const CHECKOUT_ENDPOINT = "/api/ventas/checkout";

export async function postCheckout(
  input: CheckoutInput,
  { timeoutMs = CHECKOUT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<CheckoutResult> {
  let response: Response;
  try {
    response = await fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      // Sin esto el cobro viajaría sin la cookie de sesión en algunos navegadores.
      credentials: "same-origin",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // `AbortSignal.timeout` aborta con `TimeoutError`; el resto son fallos de red,
    // que `reportActionError` ya sabe traducir.
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ActionTimeoutError(
        "El servidor no respondió a tiempo. Puedes volver a intentar el cobro.",
      );
    }
    throw error;
  }

  // El handler responde JSON incluso en los errores de negocio (400/409). Un cuerpo
  // que no es JSON significa que contestó otra cosa —proxy, error de plataforma—.
  let body: CheckoutResult | null = null;
  try {
    body = (await response.json()) as CheckoutResult;
  } catch {
    body = null;
  }

  if (!body) {
    return {
      error: `El servidor respondió de forma inesperada (${response.status}). Vuelve a intentarlo.`,
    };
  }
  return body;
}
