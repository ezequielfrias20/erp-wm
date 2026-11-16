export type MasterFieldResult =
  | { ok: true; write: false }
  | { ok: true; write: true; value: string | null }
  | { ok: false };

/**
 * Categoría, marca o línea enviadas por el editor. Si el valor no cambió no se valida ni se escribe:
 * así un producto con un maestro inactivo (o asignado a un departamento) no lo pierde al guardar
 * otra cosa. Un valor nuevo debe ser un maestro válido.
 */
export function resolveMasterField(
  submitted: string | null,
  current: string | null,
  isValid: (id: string) => boolean,
): MasterFieldResult {
  if (submitted === current) return { ok: true, write: false };
  if (submitted === null) return { ok: true, write: true, value: null };
  return isValid(submitted) ? { ok: true, write: true, value: submitted } : { ok: false };
}
