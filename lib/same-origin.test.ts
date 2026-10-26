import { describe, expect, it } from "vitest";

import { isSameOrigin } from "./same-origin";

describe("isSameOrigin", () => {
  it("acepta el origen que coincide con el host", () => {
    expect(isSameOrigin({ origin: "https://erp.worldmedics.ve", host: "erp.worldmedics.ve" })).toBe(
      true,
    );
  });

  it("acepta el host reenviado por el proxy", () => {
    expect(
      isSameOrigin({
        origin: "https://erp.worldmedics.ve",
        host: "10.0.0.7:3000",
        forwardedHost: "erp.worldmedics.ve",
      }),
    ).toBe(true);
  });

  it("rechaza otro dominio", () => {
    expect(isSameOrigin({ origin: "https://malicioso.example", host: "erp.worldmedics.ve" })).toBe(
      false,
    );
  });

  it("rechaza un subdominio parecido", () => {
    expect(
      isSameOrigin({ origin: "https://erp.worldmedics.ve.malicioso.example", host: "erp.worldmedics.ve" }),
    ).toBe(false);
  });

  it("rechaza la petición sin Origin", () => {
    expect(isSameOrigin({ origin: null, host: "erp.worldmedics.ve" })).toBe(false);
  });

  it("rechaza un Origin que no es una URL", () => {
    expect(isSameOrigin({ origin: "null", host: "erp.worldmedics.ve" })).toBe(false);
  });

  it("distingue el puerto", () => {
    expect(isSameOrigin({ origin: "http://localhost:3001", host: "localhost:3000" })).toBe(false);
    expect(isSameOrigin({ origin: "http://localhost:3000", host: "localhost:3000" })).toBe(true);
  });
});
