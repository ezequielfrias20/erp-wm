import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_TIMEOUT_MS,
  DATA_TIMEOUT_MS,
  isTransportFailure,
  supabaseFetch,
  timeoutFor,
} from "@/lib/supabase/fetch";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Captura el `init` con el que se llamó al `fetch` real. */
function spyFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true } as Response);
}

describe("supabaseFetch", () => {
  it("acota las llamadas de auth más corto que las de datos", () => {
    expect(AUTH_TIMEOUT_MS).toBeLessThan(DATA_TIMEOUT_MS);
    expect(timeoutFor("https://p.supabase.co/auth/v1/token")).toBe(AUTH_TIMEOUT_MS);
    expect(timeoutFor("https://p.supabase.co/auth/v1/.well-known/jwks.json")).toBe(
      AUTH_TIMEOUT_MS,
    );
    // Reportes y cargas masivas viven aquí: cortarlos pronto sería peor que el mal.
    expect(timeoutFor("https://p.supabase.co/rest/v1/sales")).toBe(DATA_TIMEOUT_MS);
    expect(timeoutFor("https://p.supabase.co/storage/v1/object/wm-public/x.png")).toBe(
      DATA_TIMEOUT_MS,
    );
  });

  it("clasifica igual una URL o un Request, no sólo un string", () => {
    expect(timeoutFor(new URL("https://p.supabase.co/auth/v1/user"))).toBe(
      AUTH_TIMEOUT_MS,
    );
    expect(timeoutFor(new Request("https://p.supabase.co/rest/v1/products"))).toBe(
      DATA_TIMEOUT_MS,
    );
  });

  it("acepta string, URL y Request", async () => {
    const spy = spyFetch();

    await supabaseFetch(new URL("https://p.supabase.co/auth/v1/user"));
    await supabaseFetch(new Request("https://p.supabase.co/rest/v1/products"));

    for (const call of spy.mock.calls) {
      expect((call[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("respeta la señal de quien llama sin perder la del plazo", async () => {
    const spy = spyFetch();
    const caller = new AbortController();

    await supabaseFetch("https://p.supabase.co/rest/v1/sales", {
      signal: caller.signal,
    });
    const combined = (spy.mock.calls[0][1] as RequestInit).signal!;

    expect(combined.aborted).toBe(false);
    caller.abort();
    expect(combined.aborted).toBe(true);
  });

  it("conserva el resto del init", async () => {
    const spy = spyFetch();

    await supabaseFetch("https://p.supabase.co/rest/v1/sales", {
      method: "POST",
      headers: { apikey: "x" },
    });

    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ apikey: "x" });
  });
});

describe("isTransportFailure", () => {
  // De esta distinción depende que una caída de Supabase Auth no se convierta en
  // un cierre de sesión masivo.
  it("reconoce el error reintentable de supabase-js", () => {
    expect(
      isTransportFailure({ name: "AuthRetryableFetchError", message: "Failed to fetch" }),
    ).toBe(true);
  });

  it("reconoce abortos y plazos agotados", () => {
    expect(isTransportFailure({ name: "AbortError", message: "aborted" })).toBe(true);
    expect(isTransportFailure({ name: "TimeoutError", message: "timed out" })).toBe(true);
    expect(isTransportFailure(new Error("fetch failed"))).toBe(true);
  });

  it("NO confunde un token inválido con un fallo de red", () => {
    expect(
      isTransportFailure({ name: "AuthApiError", message: "Invalid refresh token" }),
    ).toBe(false);
    expect(
      isTransportFailure({ name: "AuthInvalidJwtError", message: "Invalid JWT signature" }),
    ).toBe(false);
    expect(isTransportFailure(null)).toBe(false);
    expect(isTransportFailure("boom")).toBe(false);
  });
});
