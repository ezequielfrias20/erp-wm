import { describe, expect, it } from "vitest";
import {
  enumerateReportMonths,
  getReportDateParts,
  normalizeReportRange,
  reportRangeToIso,
} from "./report-dates";

describe("report date helpers", () => {
  it("builds a single Caracas business day as a UTC range", () => {
    expect(reportRangeToIso("2026-08-13", "2026-08-13")).toEqual({
      from: "2026-08-13",
      to: "2026-08-13",
      fromIso: "2026-08-13T04:00:00.000Z",
      toIso: "2026-08-14T03:59:59.999Z",
    });
  });

  it("keeps late UTC invoices in the previous Caracas day", () => {
    expect(getReportDateParts("2026-08-13T02:46:44.193Z")).toEqual({
      year: 2026,
      month: 8,
      day: 12,
    });
  });

  it("normalizes inverted or invalid ranges", () => {
    expect(normalizeReportRange({ from: "2026-08-14", to: "2026-08-12" })).toEqual({
      from: "2026-08-12",
      to: "2026-08-14",
    });
    expect(
      normalizeReportRange(
        { from: "bad", to: null },
        new Date("2026-08-14T15:00:00.000Z"),
      ),
    ).toEqual({
      from: "2026-08-01",
      to: "2026-08-14",
    });
  });

  it("enumerates months by report calendar dates", () => {
    expect(enumerateReportMonths("2026-12-31", "2027-01-01")).toEqual([
      { label: "Dic '26", y: 2026, m: 12 },
      { label: "Ene '27", y: 2027, m: 1 },
    ]);
  });
});
