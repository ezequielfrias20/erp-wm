import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  rgba,
  darken,
  perceivedLuminance,
  readableForeground,
  buildBrandStyle,
} from "./brand-css";

describe("hexToRgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#0EA5E9")).toEqual({ r: 14, g: 165, b: 233 });
  });
  it("is case-insensitive and tolerates no leading #", () => {
    expect(hexToRgb("0ea5e9")).toEqual({ r: 14, g: 165, b: 233 });
  });
});

describe("rgba", () => {
  it("builds an rgba() string with the given alpha", () => {
    expect(rgba("#0EA5E9", 0.1)).toBe("rgba(14, 165, 233, 0.1)");
  });
});

describe("darken", () => {
  it("darkens each channel by the given fraction", () => {
    // 14,165,233 * 0.85 -> 12,140,198 -> #0c8cc6
    expect(darken("#0EA5E9", 0.15)).toBe("#0c8cc6");
  });
});

describe("perceivedLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(perceivedLuminance("#000000")).toBeCloseTo(0, 5);
    expect(perceivedLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("readableForeground", () => {
  it("returns dark text on a light color (amber)", () => {
    expect(readableForeground("#F59E0B")).toBe("#0f172a");
  });
  it("returns white text on the default brand blue", () => {
    expect(readableForeground("#0EA5E9")).toBe("#ffffff");
  });
  it("returns white on black and dark on white", () => {
    expect(readableForeground("#000000")).toBe("#ffffff");
    expect(readableForeground("#FFFFFF")).toBe("#0f172a");
  });
});

describe("buildBrandStyle", () => {
  it("returns empty string when primary is missing", () => {
    expect(buildBrandStyle(null)).toBe("");
    expect(buildBrandStyle(undefined)).toBe("");
    expect(buildBrandStyle("")).toBe("");
  });
  it("emits brand tokens for both modes", () => {
    const css = buildBrandStyle("#0EA5E9");
    expect(css).toContain("--brand:#0EA5E9");
    expect(css).toContain("--brand-2:#0c8cc6");
    expect(css).toContain("--primary:#0EA5E9");
    expect(css).toContain("--primary-foreground:#ffffff");
    expect(css).toContain("--ring:#0EA5E9");
    expect(css).toContain("--sidebar-primary:#0EA5E9");
    expect(css).toContain("--chart-1:#0EA5E9");
    expect(css).toContain("--brand-soft:rgba(14, 165, 233, 0.1)");
    expect(css).toContain(".dark{--brand-soft:rgba(14, 165, 233, 0.15)}");
  });
});
