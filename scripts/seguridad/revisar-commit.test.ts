import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "revisar-commit.mjs");
const REGLAS = path.resolve(__dirname, "reglas.mjs");
// Armado por partes para que este archivo no parezca un secreto real.
const SECRETO = ["sb_", "secret_", "RGwe8Kq2LmN4pQ7sT9vX1z"].join("");

let repo: string;

function git(...args: string[]) {
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

function write(rel: string, content: string | Buffer) {
  const full = path.join(repo, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function revisar() {
  const r = spawnSync("node", [SCRIPT], { cwd: repo, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

beforeEach(() => {
  // Ruta con espacio y acento, como «Fr Medic Group».
  repo = mkdtempSync(path.join(tmpdir(), "revisión commit "));
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  write("README.md", "hola\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "inicio");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("revisar-commit", () => {
  it("un cambio limpio pasa", () => {
    write("app/página nueva.tsx", "export const x = 1;\n");
    git("add", "-A");
    expect(revisar().code).toBe(0);
  });

  it("bloquea un Excel agregado y lo nombra", () => {
    write("Inventario wm - Maracay .xlsx", "falso excel");
    git("add", "-A");
    const r = revisar();
    expect(r.code).toBe(1);
    expect(r.out).toContain("Inventario wm - Maracay .xlsx");
  });

  it("bloquea un secreto, dice archivo y línea, y no lo imprime", () => {
    write("docs/notas.md", `uno\nSUPABASE_SECRET_KEY=${SECRETO}\n`);
    git("add", "-A");
    const r = revisar();
    expect(r.code).toBe(1);
    expect(r.out).toContain("docs/notas.md:2");
    expect(r.out).not.toContain(SECRETO);
  });

  it("bloquea un archivo de más de 5 MB", () => {
    write("public/video.mp4", Buffer.alloc(5 * 1024 * 1024 + 1));
    git("add", "-A");
    const r = revisar();
    expect(r.code).toBe(1);
    expect(r.out).toContain("public/video.mp4");
  });

  it("borrar un Excel que ya estaba en el repo no se bloquea", () => {
    write("viejo.xlsx", "x");
    git("add", "-f", "viejo.xlsx");
    git("commit", "-q", "--no-verify", "-m", "excel viejo");
    git("rm", "-q", "viejo.xlsx");
    expect(revisar().code).toBe(0);
  });

  it("un test nuevo en scripts/seguridad no hereda la excepción", () => {
    write("scripts/seguridad/otro.test.ts", `const x = "${SECRETO}";\n`);
    git("add", "-A");
    const r = revisar();
    expect(r.code).toBe(1);
    expect(r.out).toContain("scripts/seguridad/otro.test.ts:1");
  });

  it("los archivos de reglas no se bloquean a sí mismos", () => {
    copyFileSync(REGLAS, path.join(repo, "reglas.mjs"));
    mkdirSync(path.join(repo, "scripts/seguridad"), { recursive: true });
    copyFileSync(REGLAS, path.join(repo, "scripts/seguridad/reglas.mjs"));
    write("scripts/seguridad/reglas.test.ts", `const x = "${SECRETO}";\n`);
    rmSync(path.join(repo, "reglas.mjs"));
    git("add", "-A");
    expect(revisar().code).toBe(0);
  });
});
