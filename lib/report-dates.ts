const REPORT_TIME_ZONE = "America/Caracas";
const REPORT_UTC_OFFSET_MINUTES = 4 * 60;

const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: REPORT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const REPORT_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("es-VE", {
  timeZone: REPORT_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type YmdParts = { year: number; month: number; day: number };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function parseReportDate(value: string | null | undefined): YmdParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function formatReportDate(parts: YmdParts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function addReportDays(value: string, days: number) {
  const parts = parseReportDate(value);
  if (!parts) return value;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatReportDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function reportYmdFromDate(date = new Date()) {
  const entries = REPORT_DATE_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]);
  const parts = Object.fromEntries(entries);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function reportMonthStartYmd(date = new Date()) {
  const today = reportYmdFromDate(date);
  return `${today.slice(0, 8)}01`;
}

export function normalizeReportRange(input: {
  from?: string | null;
  to?: string | null;
}, now = new Date()) {
  let from = parseReportDate(input.from) ? input.from! : reportMonthStartYmd(now);
  let to = parseReportDate(input.to) ? input.to! : reportYmdFromDate(now);

  if (from > to) [from, to] = [to, from];
  return { from, to };
}

function reportDateStartUtcMs(value: string) {
  const parts = parseReportDate(value);
  if (!parts) throw new Error(`Fecha de reporte inválida: ${value}`);
  return Date.UTC(parts.year, parts.month - 1, parts.day, 0, REPORT_UTC_OFFSET_MINUTES);
}

export function reportRangeToIso(from: string, to: string) {
  const normalized = normalizeReportRange({ from, to });
  const fromIso = new Date(reportDateStartUtcMs(normalized.from)).toISOString();
  const nextDay = addReportDays(normalized.to, 1);
  const toIso = new Date(reportDateStartUtcMs(nextDay) - 1).toISOString();
  return { fromIso, toIso, ...normalized };
}

export function getReportDateParts(value: string | Date): YmdParts {
  const date = typeof value === "string" ? new Date(value) : value;
  const entries = REPORT_DATE_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]);
  const parts = Object.fromEntries(entries);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

export function enumerateReportMonths(from: string, to: string) {
  const range = normalizeReportRange({ from, to });
  const start = parseReportDate(range.from)!;
  const end = parseReportDate(range.to)!;
  const multiYear = start.year !== end.year;
  const out: { label: string; y: number; m: number }[] = [];

  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    out.push({
      label: multiYear ? `${MONTHS[month - 1]} '${String(year).slice(2)}` : MONTHS[month - 1],
      y: year,
      m: month,
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return out;
}

export function formatReportRangeLabel(from: string, to: string) {
  const normalized = normalizeReportRange({ from, to });
  const start = new Date(reportDateStartUtcMs(normalized.from));
  if (normalized.from === normalized.to) {
    return `Día: ${REPORT_DATE_LABEL_FORMATTER.format(start)}`;
  }

  const end = new Date(reportDateStartUtcMs(normalized.to));
  return `Rango: ${REPORT_DATE_LABEL_FORMATTER.format(start)} - ${REPORT_DATE_LABEL_FORMATTER.format(end)}`;
}
