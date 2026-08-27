import { describe, expect, it, vi } from "vitest";
import { cachedFor, invalidateCache } from "@/lib/server-cache";

describe("cachedFor", () => {
  it("carga una vez y reutiliza dentro del TTL", async () => {
    const load = vi.fn().mockResolvedValue("valor");

    expect(await cachedFor("k1", 10_000, load)).toBe("valor");
    expect(await cachedFor("k1", 10_000, load)).toBe("valor");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("vuelve a cargar cuando el TTL caduca", async () => {
    const load = vi.fn().mockResolvedValue("valor");

    await cachedFor("k2", 0, load);
    await cachedFor("k2", 0, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("comparte una sola carga entre peticiones concurrentes", async () => {
    let resolve: (v: string) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );

    const a = cachedFor("k3", 10_000, load);
    const b = cachedFor("k3", 10_000, load);
    resolve("compartido");

    expect(await a).toBe("compartido");
    expect(await b).toBe("compartido");
    // Sin deduplicación, dos navegaciones simultáneas harían dos viajes a Supabase.
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("invalida por prefijo", async () => {
    const load = vi.fn().mockResolvedValue("v");

    await cachedFor("session:abc", 10_000, load);
    await cachedFor("session:def", 10_000, load);
    expect(load).toHaveBeenCalledTimes(2);

    invalidateCache("session:");

    await cachedFor("session:abc", 10_000, load);
    await cachedFor("session:def", 10_000, load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("no memoriza un fallo, para que el siguiente intento vuelva a probar", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("caída"))
      .mockResolvedValue("recuperado");

    await expect(cachedFor("k4", 10_000, load)).rejects.toThrow("caída");
    expect(await cachedFor("k4", 10_000, load)).toBe("recuperado");
  });
});
