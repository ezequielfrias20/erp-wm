import { useId } from "react";

/**
 * Fondo genérico del panel de acceso: cintas de color hechas sólo con `--brand`, así cada
 * negocio ve el suyo sin haber subido nada. Se reemplaza con `settings.login_image_url`.
 */

/** Tono vecino al de la marca: `l` aclara (+) u oscurece (−), `h` gira el matiz en grados. */
function tone(l: number, h = 0, c = 1) {
  return `oklch(from var(--brand) clamp(0.16, calc(l + ${l}), 0.97) calc(c * ${c}) calc(h + ${h}))`;
}

const RIBBONS: { d: string; from: string; to: string }[] = [
  {
    d: "M0 250C110 150 210 190 300 290S500 400 600 250V750H0Z",
    from: tone(0.2, -12, 0.55),
    to: tone(0.04, -6, 0.9),
  },
  {
    d: "M0 400C90 300 160 270 250 360S430 560 600 380V750H0Z",
    from: tone(0.1, -8, 0.8),
    to: tone(-0.06, 4),
  },
  {
    d: "M0 420C120 420 190 560 310 560S500 440 600 500V750H0Z",
    from: tone(0.02, 2),
    to: tone(-0.16, 16),
  },
  {
    d: "M0 640C110 540 200 560 320 630S520 690 600 590V750H0Z",
    from: tone(-0.1, 12),
    to: tone(-0.28, 24),
  },
];

export function AuthArt() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 750"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" style={{ stopColor: tone(0.08, 4, 0.75) }} />
          <stop offset="0.55" style={{ stopColor: tone(0.26, -10, 0.28) }} />
        </linearGradient>
        <radialGradient id={`${uid}sun`}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.32" stopColor="#fff" stopOpacity="0.8" />
          <stop offset="0.36" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {RIBBONS.map((r, i) => (
          <linearGradient key={i} id={`${uid}r${i}`} x1="0" y1="0" x2="0.75" y2="1">
            <stop offset="0" style={{ stopColor: r.from }} />
            <stop offset="0.7" style={{ stopColor: r.to }} />
          </linearGradient>
        ))}
        <linearGradient id={`${uid}edge`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
      </defs>

      <rect width="600" height="750" fill={`url(#${uid}sky)`} />
      <circle cx="430" cy="185" r="190" fill={`url(#${uid}sun)`} />
      {RIBBONS.map((r, i) => (
        <g key={i} className="auth-ribbon" style={{ animationDelay: `${i * 90}ms` }}>
          <path d={r.d} fill={`url(#${uid}r${i})`} />
          <path
            d={r.d.replace("V750H0Z", "")}
            fill="none"
            stroke={`url(#${uid}edge)`}
            strokeWidth="1.5"
          />
        </g>
      ))}
      <rect
        width="600"
        height="750"
        filter={`url(#${uid}grain)`}
        opacity="0.14"
        style={{ mixBlendMode: "overlay" }}
      />
    </svg>
  );
}
