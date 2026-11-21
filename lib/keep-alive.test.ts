import { describe, expect, it } from "vitest";
import { heartbeatStatus, isKeepAliveAuthorized, keepAliveErrorSummary, STALE_AFTER_MS } from "./keep-alive";

describe("isKeepAliveAuthorized", () => {
  it("sin CRON_SECRET la ruta queda abierta", () => {
    expect(isKeepAliveAuthorized(null, undefined)).toBe(true);
  });

  it("un CRON_SECRET vacío o de espacios cuenta como no definido", () => {
    expect(isKeepAliveAuthorized(null, "")).toBe(true);
    expect(isKeepAliveAuthorized(null, "   ")).toBe(true);
  });

  it("con CRON_SECRET acepta exactamente «Bearer <secreto>»", () => {
    expect(isKeepAliveAuthorized("Bearer s3cr3t", "s3cr3t")).toBe(true);
  });

  it("un CRON_SECRET guardado con espacio o salto de línea final sigue aceptando el header de Vercel", () => {
    // HTTP recorta los espacios de los extremos del valor de un header: llega «Bearer s3cr3t».
    expect(isKeepAliveAuthorized("Bearer s3cr3t", "s3cr3t\n")).toBe(true);
    expect(isKeepAliveAuthorized("Bearer s3cr3t", " s3cr3t ")).toBe(true);
  });

  it("con CRON_SECRET rechaza la falta de header", () => {
    expect(isKeepAliveAuthorized(null, "s3cr3t")).toBe(false);
  });

  it("con CRON_SECRET rechaza el secreto sin el prefijo Bearer", () => {
    expect(isKeepAliveAuthorized("s3cr3t", "s3cr3t")).toBe(false);
  });

  it("con CRON_SECRET rechaza otro secreto del mismo largo", () => {
    expect(isKeepAliveAuthorized("Bearer s3cr3x", "s3cr3t")).toBe(false);
  });

  it("con CRON_SECRET rechaza el secreto con texto de más", () => {
    expect(isKeepAliveAuthorized("Bearer s3cr3t-extra", "s3cr3t")).toBe(false);
  });
});

describe("keepAliveErrorSummary", () => {
  it("usa el código de un error de PostgREST", () => {
    expect(keepAliveErrorSummary({ code: "PGRST202", message: "Could not find the function" })).toBe(
      "PGRST202: Could not find the function",
    );
  });

  it("usa el mensaje de un Error común", () => {
    expect(keepAliveErrorSummary(new Error("La conexión privada del servidor no está configurada."))).toBe(
      "La conexión privada del servidor no está configurada.",
    );
  });

  it("recorta mensajes largos a 200 caracteres", () => {
    expect(keepAliveErrorSummary(new Error("x".repeat(500)))).toHaveLength(200);
  });

  it("cualquier otra cosa es «error desconocido»", () => {
    expect(keepAliveErrorSummary(null)).toBe("error desconocido");
    expect(keepAliveErrorSummary(42)).toBe("error desconocido");
  });
});

describe("heartbeatStatus", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("sin latido registrado es «never»", () => {
    expect(heartbeatStatus(null, now)).toBe("never");
  });

  it("un latido de hace 1 hora es «ok»", () => {
    expect(heartbeatStatus(ago(60 * 60 * 1000), now)).toBe("ok");
  });

  it("exactamente 3 días todavía es «ok»", () => {
    expect(STALE_AFTER_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(heartbeatStatus(ago(STALE_AFTER_MS), now)).toBe("ok");
  });

  it("más de 3 días es «stale»", () => {
    expect(heartbeatStatus(ago(STALE_AFTER_MS + 60 * 1000), now)).toBe("stale");
  });
});
