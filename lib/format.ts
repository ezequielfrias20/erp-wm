/** Currency + number formatting, matching the handoff (USD en-US, VES de-DE separators). */

export function fmtUSD(n: number | null | undefined): string {
  return "$" + Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtUSDShort(n: number | null | undefined): string {
  return fmtUSD(n).replace(".00", "");
}

export function fmtVES(n: number | null | undefined): string {
  return "Bs. " + Number(n ?? 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtNum(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString("en-US");
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  return Number(n ?? 0).toLocaleString("es-VE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + "%";
}

const DATE_FMT = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return DATE_FMT.format(new Date(d));
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return DATETIME_FMT.format(new Date(d));
}

/** "hace 5 min" style relative time. */
export function fmtRelative(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `hace ${days} días`;
  return fmtDate(date);
}

/** Initials from a name, e.g. "María González" -> "MG". */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
