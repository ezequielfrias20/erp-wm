// Reglas que impiden subir al repo secretos o datos del negocio. Puras: las usan el hook de git
// (scripts/seguridad/revisar-commit.mjs) y sus tests. Diseño:
// docs/superpowers/specs/2026-11-21-seguridad-repo-design.md

/** Archivos más grandes que esto no entran (fotos, volcados, Excel renombrados…). */
export const MAX_BYTES = 5 * 1024 * 1024;

/** Marca para dejar pasar a propósito una línea concreta (ejemplos inevitables en docs). */
export const ESCAPE = "secreto-permitido";

const DATA_EXT =
  /\.(xlsx|xlsm|xls|csv|tsv|dump|bak|p12|pfx|p8|key|pem|jks|keystore|ppk|ovpn)$|\.sql\.(gz|bz2|xz|zip)$/;

/** ¿Por qué no puede entrar este archivo, sólo por su nombre? `null` si puede. */
export function blockedPathReason(path) {
  // En macOS «.ENV» y «.env» son el mismo archivo: se compara todo en minúsculas.
  const lower = path.toLowerCase();
  const name = lower.split("/").pop() ?? lower;
  if (/(^|\/)backups\//.test(lower)) return "respaldo local (carpeta backups/)";
  if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") return "archivo de variables de entorno (.env)";
  if (DATA_EXT.test(name)) return "archivo de datos o de llaves (Excel, CSV, volcado, certificado)";
  return null;
}

/**
 * ¿Es un marcador de ejemplo y no un secreto? Se decide por la FORMA del valor completo, nunca
 * por caracteres sueltos: una contraseña real puede llevar `$`, `*` o `<`. Ante la duda, secreto.
 */
function isPlaceholder(value) {
  const v = value.replace(/^["'`]+/, "").replace(/["'`;,)]+$/, "");
  if (!v) return true;
  return (
    /^</.test(v) || // <password>, <desde el archivo>
    /^\[.*\]$/.test(v) ||
    /^\*{3,}$/.test(v) || // ***
    /^(\.{3}|…)$/.test(v) || // ...
    /^\$(\{?[A-Za-z_][A-Za-z0-9_]*\}?|\()/.test(v) || // $VAR, ${VAR}, $(comando)
    /^(tu|your)[_-]/i.test(v) || // TU_PASSWORD
    /^(password|contraseña|contrasena|changeme|example|ejemplo)/i.test(v) // ContraseñaSegura.2026 (docs)
  );
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
      for (const m of l.matchAll(/PGPASSWORD\s*=\s*(\S+)/g)) {
        if (!isPlaceholder(m[1])) return true;
      }
      return false;
    },
  },
  {
    // Contraseñas escritas en docs o código: «**Password:** `valor`», «password: "valor"».
    // Cuenta si el valor lleva dígito o símbolo, o es largo (frase de paso); así no se confunden
    // los textos de formularios («Contraseña actual»).
    kind: "contraseña escrita",
    test: (l) => {
      const re = /(?:password|passwd|contraseña|contrasena|clave)[^\n]{0,30}?[:=|][^\n]{0,8}?[`'"]([^`'"\s]{6,})[`'"]/gi;
      for (const m of l.matchAll(re)) {
        const v = m[1];
        const strong = /\d/.test(v) || /[^A-Za-z]/.test(v) || v.length >= 16;
        if (strong && !isPlaceholder(v)) return true;
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
