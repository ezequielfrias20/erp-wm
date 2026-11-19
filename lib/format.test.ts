import { describe, expect, it } from "vitest";
import { fmtDateTimeCaracas, fmtRelative } from "./format";

describe("Caracas order dates", () => {
  it("formats a fixed UTC instant in Caracas time", () => {
    expect(fmtDateTimeCaracas("2026-11-19T15:03:00Z")).toContain("11:03");
  });

  it("uses the supplied instant for relative labels", () => {
    expect(fmtRelative("2026-11-19T15:03:00Z", Date.parse("2026-11-19T15:10:00Z"))).toBe("hace 7 min");
  });
});
