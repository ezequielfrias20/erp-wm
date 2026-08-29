import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthTimeoutError,
  isAuthTimeout,
  loadJwks,
  resetJwksCache,
  withTimeout,
} from "@/lib/supabase/jwks";

const URL_BASE = "https://proyecto.supabase.co";
const KEY = { kty: "EC", key_ops: ["verify"], alg: "ES256", kid: "abc" };

function okResponse(keys: unknown[] = [KEY]) {
  return { ok: true, json: async () => ({ keys }) } as Response;
}

/** Un `fetch` que nunca resuelve, como el endpoint degradado de producción. */
function hangingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "TimeoutError")),
        );
      }),
  );
}

beforeEach(() => {
  resetJwksCache();
  delete process.env.SUPABASE_AUTH_JWKS;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("loadJwks", () => {
  it("usa SUPABASE_AUTH_JWKS sin tocar la red", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env.SUPABASE_AUTH_JWKS = JSON.stringify({ keys: [KEY] });

    expect(await loadJwks(URL_BASE)).toEqual({ status: "ok", jwks: { keys: [KEY] } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("acepta también un array pelado en la variable de entorno", async () => {
    process.env.SUPABASE_AUTH_JWKS = JSON.stringify([KEY]);
    expect(await loadJwks(URL_BASE)).toEqual({ status: "ok", jwks: { keys: [KEY] } });
  });

  it("ignora una variable con JSON inválido y descarga", async () => {
    process.env.SUPABASE_AUTH_JWKS = "{no es json";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

    expect(await loadJwks(URL_BASE)).toEqual({ status: "ok", jwks: { keys: [KEY] } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("descarga una vez y reutiliza la caché en llamadas siguientes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

    await loadJwks(URL_BASE);
    await loadJwks(URL_BASE);
    await loadJwks(URL_BASE);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("pide el JWKS del proyecto con AbortSignal", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

    await loadJwks(`${URL_BASE}/`);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${URL_BASE}/auth/v1/.well-known/jwks.json`);
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("comparte una sola descarga entre peticiones concurrentes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

    await Promise.all([loadJwks(URL_BASE), loadJwks(URL_BASE), loadJwks(URL_BASE)]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("no se cuelga si el endpoint no responde: aborta y lo marca inalcanzable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      hangingFetch() as unknown as typeof fetch,
    );

    // Sin el AbortSignal esto no terminaría nunca — que es justo lo que colgaba
    // el proxy hasta el 504 MIDDLEWARE_INVOCATION_TIMEOUT.
    expect(await loadJwks(URL_BASE)).toEqual({ status: "unreachable" });
  });

  it("no martillea el endpoint tras un fallo", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network"));

    expect(await loadJwks(URL_BASE)).toEqual({ status: "unreachable" });
    expect(await loadJwks(URL_BASE)).toEqual({ status: "unreachable" });
    expect(await loadJwks(URL_BASE)).toEqual({ status: "unreachable" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sigue sirviendo las claves rancias mientras refresca de fondo", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

    expect(await loadJwks(URL_BASE)).toEqual({ status: "ok", jwks: { keys: [KEY] } });

    // Pasado el TTL, el endpoint deja de responder.
    vi.advanceTimersByTime(11 * 60_000);
    fetchSpy.mockImplementation(hangingFetch() as unknown as typeof fetch);

    // La respuesta es inmediata y con las claves viejas: no esperamos al refresco.
    expect(await loadJwks(URL_BASE)).toEqual({ status: "ok", jwks: { keys: [KEY] } });
  });

  it("descarta respuestas sin claves utilizables", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse([]));
    expect(await loadJwks(URL_BASE)).toEqual({ status: "unreachable" });
  });

  it("un 4xx es 'absent' (proyecto HS256), no una caída", async () => {
    // La diferencia importa: con 'absent' seguimos llamando a getClaims(), que cae
    // a getUser(); con 'unreachable' ni lo intentamos.
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    expect(await loadJwks(URL_BASE)).toEqual({ status: "absent" });
    expect(await loadJwks(URL_BASE)).toEqual({ status: "absent" });
  });

  it("rellena key_ops cuando el JWKS no lo trae", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okResponse([{ kty: "EC", kid: "abc" }]),
    );

    const result = await loadJwks(URL_BASE);
    expect(result.status === "ok" && result.jwks.keys[0].key_ops).toEqual(["verify"]);
  });
});

describe("withTimeout", () => {
  it("deja pasar el valor si llega a tiempo", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1_000)).resolves.toBe("ok");
  });

  it("propaga el error original sin disfrazarlo de timeout", async () => {
    const boom = new Error("boom");
    await expect(withTimeout(Promise.reject(boom), 1_000)).rejects.toBe(boom);
  });

  it("rechaza con AuthTimeoutError si se agota el plazo", async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const result = withTimeout(never, 3_000);

    vi.advanceTimersByTime(3_000);

    await expect(result).rejects.toBeInstanceOf(AuthTimeoutError);
  });

  it("isAuthTimeout distingue el timeout de cualquier otro fallo", () => {
    expect(isAuthTimeout(new AuthTimeoutError(3_000))).toBe(true);
    expect(isAuthTimeout(new Error("invalid refresh token"))).toBe(false);
  });
});
