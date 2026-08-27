import "server-only";

/** Emits structured slow-operation logs that Vercel can filter by `event`. */
export async function measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= 250) {
      console.warn(JSON.stringify({ event: "slow_operation", name, durationMs }));
    }
  }
}
