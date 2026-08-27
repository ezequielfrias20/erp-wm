import "server-only";

/**
 * Recuerda a nivel de proceso qué objetos del esquema existen realmente.
 *
 * El código tiene varios caminos de respaldo para tolerar despliegues progresivos
 * (una RPC que aún no está, una columna recién añadida). El problema no era el
 * respaldo en sí, era pagarlo en **cada** petición: un viaje de red que falla,
 * y sólo después el camino lento. Aquí el intento fallido se paga una vez y
 * caduca a los 5 minutos, así que en cuanto se aplica el SQL se recupera solo
 * sin necesidad de redespliegue.
 */

const TTL_MS = 300_000;

type Flag = { available: boolean; expiresAt: number };

const flags = new Map<string, Flag>();

function read(name: string): boolean | null {
  const flag = flags.get(name);
  if (!flag || flag.expiresAt <= Date.now()) return null;
  return flag.available;
}

function write(name: string, available: boolean) {
  flags.set(name, { available, expiresAt: Date.now() + TTL_MS });
}

/** Sólo para tests. */
export function resetCapabilities() {
  flags.clear();
}

type PgError = { code?: string; message?: string } | null;

/** PGRST202: PostgREST no encuentra la función en el cache de esquema. */
export function isMissingFunction(error: PgError): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.message?.includes("Could not find the function") === true
  );
}

/** 42703: undefined_column. */
export function isMissingColumn(error: PgError, column: string): boolean {
  if (!error) return false;
  if (error.code === "42703") return error.message?.includes(column) !== false;
  return error.message?.includes(column) === true;
}

/**
 * Ejecuta `runRpc` y, si la función no existe en el esquema, cae a `runFallback`
 * recordando la ausencia para no volver a intentarlo hasta que caduque.
 */
export async function rpcOrFallback<T>(
  name: string,
  runRpc: () => Promise<{ data: T | null; error: PgError }>,
  runFallback: () => Promise<T>,
): Promise<T> {
  if (read(`rpc:${name}`) === false) return runFallback();

  const { data, error } = await runRpc();
  if (!error) {
    write(`rpc:${name}`, true);
    return data as T;
  }
  if (isMissingFunction(error)) {
    write(`rpc:${name}`, false);
    return runFallback();
  }
  throw new Error(error.message ?? `Falló la RPC ${name}`);
}

/**
 * Elige entre dos listas de columnas recordando cuál acepta el esquema, para no
 * repetir la consulta completa dos veces en cada carga cuando falta una columna.
 */
export async function selectWithOptionalColumns<T>(
  name: string,
  column: string,
  full: string,
  reduced: string,
  run: (select: string) => Promise<T>,
): Promise<T> {
  const key = `col:${name}.${column}`;
  if (read(key) === false) return run(reduced);

  try {
    const result = await run(full);
    write(key, true);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes(column)) {
      write(key, false);
      return run(reduced);
    }
    throw error;
  }
}
