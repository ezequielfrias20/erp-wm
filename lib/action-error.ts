import { toast } from "sonner";

/**
 * Rescate para las Server Actions que no llegan a responder.
 *
 * Las acciones del ERP devuelven `{ error }` para los fallos de negocio, así que
 * el camino normal ya está cubierto. Lo que no lo estaba es el fallo de transporte:
 * si el POST muere en el camino —red caída, 504 del proxy, despliegue a mitad—, la
 * promesa **rechaza** y esa excepción escapa de `startTransition`. Cuando eso pasa
 * la transición nunca se cierra: `pending` se queda en `true` y todo lo que cuelga
 * de `disabled={pending}` queda muerto hasta recargar la página.
 *
 * Usar siempre así, para que la transición termine limpia:
 *
 * ```ts
 * startTransition(async () => {
 *   try {
 *     const res = await miAccion(...);
 *     if (res.error) return toast.error(res.error);
 *     // ...
 *   } catch (error) {
 *     reportActionError(error, "No se pudo guardar.");
 *   }
 * });
 * ```
 */

/** Errores de control de flujo de Next (`redirect`, `notFound`): deben seguir subiendo. */
function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("unexpected response was received from the server")
  );
}

/**
 * Convierte una excepción en un mensaje para el usuario. Relanza los errores de
 * control de flujo de Next, que no son fallos.
 */
export function actionErrorMessage(error: unknown, fallback: string): string {
  if (isNextControlFlow(error)) throw error;
  if (isNetworkFailure(error)) {
    return "Se perdió la conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  }
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail ? `${fallback} (${detail})` : fallback;
}

/** Avisa al usuario y deja constancia en consola para depurar. */
export function reportActionError(error: unknown, fallback: string) {
  const message = actionErrorMessage(error, fallback);
  console.error(fallback, error);
  toast.error(message);
}
