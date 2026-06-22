/** Pure colour helpers for the runtime brand-colour override. No DOM, fully testable. */

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/** Multiply each channel by (1 - amount). amount 0..1. */
export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - amount;
  return `#${toHex(r * f)}${toHex(g * f)}${toHex(b * f)}`;
}

/** Simple perceived luminance, 0 (black) .. 1 (white). */
export function perceivedLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Pick readable text colour over `hex`. Threshold 0.6 keeps blues/violets white,
 *  flips light colours (amber) to dark text. */
export function readableForeground(hex: string): string {
  return perceivedLuminance(hex) > 0.6 ? "#0f172a" : "#ffffff";
}

/** CSS that overrides the brand tokens at runtime. Empty string when no colour set.
 *  Same colour in light and dark per design; only --brand-soft differs (0.10 / 0.15). */
export function buildBrandStyle(primary: string | null | undefined): string {
  if (!primary) return "";
  const brand2 = darken(primary, 0.15);
  const fg = readableForeground(primary);
  return (
    `:root,.dark{` +
    `--brand:${primary};` +
    `--brand-2:${brand2};` +
    `--brand-soft:${rgba(primary, 0.1)};` +
    `--primary:${primary};` +
    `--primary-foreground:${fg};` +
    `--ring:${primary};` +
    `--sidebar-primary:${primary};` +
    `--sidebar-primary-foreground:${fg};` +
    `--sidebar-ring:${primary};` +
    `--chart-1:${primary}` +
    `}` +
    `.dark{--brand-soft:${rgba(primary, 0.15)}}`
  );
}
