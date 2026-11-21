// Reglas que impiden subir al repo secretos o datos del negocio. Puras: las usan el hook de git
// (scripts/seguridad/revisar-commit.mjs) y sus tests. Diseño:
// docs/superpowers/specs/2026-11-21-seguridad-repo-design.md

/** Archivos más grandes que esto no entran (fotos, volcados, Excel renombrados…). */
export const MAX_BYTES = 5 * 1024 * 1024;

/** Marca para dejar pasar a propósito una línea concreta (ejemplos inevitables en docs). */
export const ESCAPE = "secreto-permitido";

const DATA_EXT = /\.(xlsx|xls|csv|tsv|dump|bak|p12|pfx|key|pem)$|\.sql\.gz$/i;

/** ¿Por qué no puede entrar este archivo, sólo por su nombre? `null` si puede. */
export function blockedPathReason(path) {
  const name = path.split("/").pop() ?? path;
  if (/(^|\/)backups\//.test(path)) return "respaldo local (carpeta backups/)";
  if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") return "archivo de variables de entorno (.env)";
  if (DATA_EXT.test(name)) return "archivo de datos o de llaves (Excel, CSV, volcado, certificado)";
  return null;
}

// Valores que son marcadores de ejemplo, no secretos reales.
const PLACEHOLDER_CHARS = /[<>$*…]|\.\.\./;
const PLACEHOLDER_WORDS = [
  "TU_",
  "TU-",
  "YOUR_",
  "PASSWORD",
  "CONTRASEÑA",
  "CONTRASENA",
  "SEGURA",
  "EXAMPLE",
  "EJEMPLO",
  "CHANGEME",
  "REPLACE",
  "XXXX",
];

function isPlaceholder(value) {
  const v = value.replace(/^["'`]|["'`]$/g, "");
  if (!v || PLACEHOLDER_CHARS.test(v)) return true;
  const upper = v.toUpperCase();
  return PLACEHOLDER_WORDS.some((w) => upper.includes(w));
}

const RULES = [
  { kind: "llave secreta de Supabase", test: (l) => /sb_secret_[A-Za-z0-9_-]{16,}/.test(l) },
  {
    kind: "token JWT (llave de Supabase u otra)",
    test: (l) => /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(l),
  },
  { kind: "llave de Resend", test: (l) => /\bre_[A-Za-z0-9_]{20,}/.test(l) },
  { kind: "llave privada", test: (l) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(l) },
  {
    kind: "cadena de conexión con contraseña",
    test: (l) => {
      for (const m of l.matchAll(/postgres(?:ql)?:\/\/[^:\s/@]+:([^@\s]+)@/g)) {
        if (!isPlaceholder(m[1])) return true;
      }
      return false;
    },
  },
  {
    kind: "PGPASSWORD con valor",
    test: (l) => {
      const m = l.match(/PGPASSWORD\s*=\s*(\S+)/);
      return Boolean(m && !isPlaceholder(m[1]));
    },
  },
  {
    // Contraseñas escritas en docs o código: «**Password:** `valor`», «password: "valor"».
    // Sólo valores con letras y dígitos, para no confundir textos de formularios.
    kind: "contraseña escrita",
    test: (l) => {
      const re = /(?:password|passwd|contraseña|contrasena|clave)[^\n]{0,30}?[:=|][^\n]{0,8}?[`'"]([^`'"\s]{6,})[`'"]/gi;
      for (const m of l.matchAll(re)) {
        const v = m[1];
        if (/\d/.test(v) && /[A-Za-z]/.test(v) && !isPlaceholder(v)) return true;
      }
      return false;
    },
  },
];

/** ¿Qué tipo de secreto parece haber en esta línea? `null` si ninguno. Nunca devuelve el valor. */
export function secretKindInLine(line) {
  if (line.includes(ESCAPE)) return null;
  for (const rule of RULES) {
    if (rule.test(line)) return rule.kind;
  }
  return null;
}
