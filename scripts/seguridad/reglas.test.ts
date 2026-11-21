import { describe, expect, it } from "vitest";
import { blockedPathReason, MAX_BYTES, secretKindInLine } from "./reglas.mjs";

// Los valores de ejemplo se arman por partes para que este archivo no parezca un secreto real
// a otros escáneres (gitleaks en GitHub).
const join = (...p: string[]) => p.join("");

describe("blockedPathReason", () => {
  it.each([
    "Inventario wm - Maracay .xlsx",
    "datos/ventas.XLS",
    "export.csv",
    "export.tsv",
    "base.dump",
    "base.sql.gz",
    "viejo.bak",
    "cert.p12",
    "cert.pfx",
    "server.key",
    "server.pem",
    ".env",
    ".env.local",
    ".env.cliente-pruebas",
    "app/.env.production",
    "backups/precios.json",
    "backups/catalogo/foto.png",
    // Mayúsculas: en macOS son el mismo archivo.
    ".ENV",
    ".Env.Local",
    "Backups/precios.json",
    "Reporte.XLSX",
    // Más formatos de datos y llaves.
    "libro.xlsm",
    "base.sql.bz2",
    "base.sql.zip",
    "llaves.jks",
    "putty.ppk",
    "AuthKey.p8",
    "vpn.ovpn",
  ])("bloquea %s", (path) => {
    expect(blockedPathReason(path)).toEqual(expect.any(String));
  });

  it.each([".env.example", "app/page.tsx", "public/favicon-default.ico", "docs/CARGA-MASIVA.md", "lib/excel.ts"])(
    "deja pasar %s",
    (path) => {
      expect(blockedPathReason(path)).toBeNull();
    },
  );

  it("el límite de tamaño es 5 MB", () => {
    expect(MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("secretKindInLine", () => {
  it.each([
    [join("SUPABASE_SECRET_KEY=sb_", "secret_", "RGwe8Kq2LmN4pQ7sT9vX1z")],
    [join("const k = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", ".eyJyb2xlIjoic2VydmljZV9yb2xlIn0", ".dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'")],
    [join("RESEND_API_KEY=re_", "9fKq2LmN4pQ7sT9vX1zA3bC5dE7fG9hJ")],
    [join("postgresql://postgres:", "Abc123xyz", "@db.ref.supabase.co:5432/postgres")],
    [join("export PGPASSWORD=", "Abc123xyz")],
    [join("-----BEGIN ", "PRIVATE KEY-----")],
    [join("-----BEGIN RSA ", "PRIVATE KEY-----")],
    [join("- **Email:** `x@y.com` · **Password:** `", "Mz7.Kp92-qX", "`")],
    [join("| **Contraseña** | `", "Mz7.Kp92-qX", "` |")],
    [join("password: \"", "Mz7.Kp92-qX", "\"")],
  ])("detecta un secreto en: %s", (line) => {
    expect(secretKindInLine(line)).toEqual(expect.any(String));
  });

  it.each([
    "postgresql://postgres:TU_PASSWORD@db.TUREF.supabase.co:5432/postgres",
    "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres",
    "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
    "SUPABASE_DB_URL=postgresql://postgres:***@host:5432/postgres",
    "export PGPASSWORD='TU_PASSWORD'",
    "export PGPASSWORD=\"$(grep -m1 '^PGPASSWORD=' .env.cliente-pruebas)\"",
    "PGPASSWORD=<desde el archivo>",
    "PGPASSWORD=...",
    "SECRET_KEY=sb_secret_...",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...",
    "RESEND_API_KEY=re_...",
    "  -v owner_password='ContraseñaSegura.2026' \\",
    "const password = String(formData.get(\"password\") ?? \"\");",
    "if (password !== confirm) return { error: \"Las contraseñas no coinciden.\" };",
    "| **Contraseña** | la que elegiste al crear el owner |",
    "const response = await fetch(url);",
  ])("deja pasar: %s", (line) => {
    expect(secretKindInLine(line)).toBeNull();
  });

  it.each([
    // Contraseñas reales con símbolos que antes se confundían con marcadores de ejemplo.
    [join("postgresql://postgres:", "Ab$9xQ%k&2", "@db.ref.supabase.co:5432/postgres")],
    [join("postgresql://postgres:", "Kq*7mZ!x", "@host:5432/postgres")],
    [join("export PGPASSWORD=", "MiClaveSegura2026")],
    [join("export PGPASSWORD=", "Zx$9kq2LmN")],
    // Segunda aparición en la misma línea.
    [join("PGPASSWORD='<valor>' && PGPASSWORD=", "Abc123xyz")],
    // Contraseña sin dígitos pero con símbolo, o larga.
    [join("**Password:** `", "Mi.Clave!Fuerte", "`")],
    [join("password: \"", "correcthorsebatterystaple", "\"")],
  ])("detecta aunque parezca un ejemplo: %s", (line) => {
    expect(secretKindInLine(line)).toEqual(expect.any(String));
  });

  it("una línea marcada con secreto-permitido pasa aunque parezca un secreto", () => {
    expect(secretKindInLine(join("PGPASSWORD=", "Abc123xyz # secreto-permitido"))).toBeNull();
  });
});
