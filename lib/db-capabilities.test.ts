import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMissingColumn,
  isMissingFunction,
  resetCapabilities,
  rpcOrFallback,
  selectWithOptionalColumns,
} from "@/lib/db-capabilities";

const MISSING_FN = {
  code: "PGRST202",
  message: "Could not find the function wm.report_payments in the schema cache",
};

beforeEach(() => {
  resetCapabilities();
});

describe("detección de objetos ausentes", () => {
  it("reconoce una función que no está en el esquema", () => {
    expect(isMissingFunction(MISSING_FN)).toBe(true);
    expect(isMissingFunction({ code: "42501", message: "permission denied" })).toBe(
      false,
    );
    expect(isMissingFunction(null)).toBe(false);
  });

  it("reconoce una columna ausente por nombre", () => {
    const error = {
      code: "42703",
      message: "column sales.seller_commission_pct does not exist",
    };
    expect(isMissingColumn(error, "seller_commission_pct")).toBe(true);
    expect(isMissingColumn(error, "otra_columna")).toBe(false);
  });
});

describe("rpcOrFallback", () => {
  it("usa la RPC cuando existe y no toca el respaldo", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "rpc", error: null });
    const fallback = vi.fn().mockResolvedValue("fallback");

    expect(await rpcOrFallback("x", rpc, fallback)).toBe("rpc");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("cae al respaldo cuando la función no existe", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: MISSING_FN });
    const fallback = vi.fn().mockResolvedValue("fallback");

    expect(await rpcOrFallback("report_payments", rpc, fallback)).toBe("fallback");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("no vuelve a intentar la RPC ausente en llamadas siguientes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: MISSING_FN });
    const fallback = vi.fn().mockResolvedValue("fallback");

    await rpcOrFallback("report_payments", rpc, fallback);
    await rpcOrFallback("report_payments", rpc, fallback);
    await rpcOrFallback("report_payments", rpc, fallback);

    // Éste es el punto: el viaje de red que falla se paga UNA vez, no en cada petición.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(3);
  });

  it("propaga cualquier otro error en vez de silenciarlo con el respaldo", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "42501", message: "denegado" } });
    const fallback = vi.fn();

    await expect(rpcOrFallback("x", rpc, fallback)).rejects.toThrow("denegado");
    expect(fallback).not.toHaveBeenCalled();
  });
});

describe("selectWithOptionalColumns", () => {
  it("usa la lista completa cuando la columna existe", async () => {
    const run = vi.fn().mockResolvedValue(["fila"]);
    expect(
      await selectWithOptionalColumns("sales", "commission_pct", "a, b", "a", run),
    ).toEqual(["fila"]);
    expect(run).toHaveBeenCalledExactlyOnceWith("a, b");
  });

  it("reintenta sin la columna ausente y lo recuerda", async () => {
    const run = vi.fn(async (select: string) => {
      if (select.includes("commission_pct")) {
        throw new Error("column sales.commission_pct does not exist");
      }
      return ["fila"];
    });

    expect(
      await selectWithOptionalColumns(
        "sales",
        "commission_pct",
        "a, commission_pct",
        "a",
        run,
      ),
    ).toEqual(["fila"]);
    expect(run).toHaveBeenCalledTimes(2);

    run.mockClear();
    expect(
      await selectWithOptionalColumns(
        "sales",
        "commission_pct",
        "a, commission_pct",
        "a",
        run,
      ),
    ).toEqual(["fila"]);
    // La segunda vez ya no repite la consulta completa: va directo a la reducida.
    expect(run).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("no confunde otros errores con una columna ausente", async () => {
    const run = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(
      selectWithOptionalColumns("sales", "commission_pct", "a, b", "a", run),
    ).rejects.toThrow("timeout");
  });
});
