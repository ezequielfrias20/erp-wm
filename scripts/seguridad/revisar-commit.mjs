#!/usr/bin/env node
// Revisión antes de cada commit (la llama .githooks/pre-commit): bloquea secretos, archivos de
// datos y archivos grandes en lo que está preparado para el commit. Nunca imprime el secreto.
// Reglas: scripts/seguridad/reglas.mjs · Guía: docs/SEGURIDAD-REPO.md
import { execFileSync } from "node:child_process";
import { blockedPathReason, ESCAPE, MAX_BYTES, secretKindInLine } from "./reglas.mjs";

// Los archivos de reglas y sus tests contienen patrones de ejemplo a propósito.
const SKIP_CONTENT = [/^scripts\/seguridad\/reglas\.mjs$/, /^scripts\/seguridad\/[^/]+\.test\.ts$/];

function git(args) {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** Archivos agregados, modificados, copiados o renombrados (destino) en lo preparado. */
function stagedPaths() {
  const parts = git(["diff", "--cached", "--name-status", "-z", "--diff-filter=ACMR"]).split("\0");
  const paths = [];
  for (let i = 0; i < parts.length - 1; ) {
    const status = parts[i];
    if (!status) break;
    if (status.startsWith("R") || status.startsWith("C")) {
      paths.push(parts[i + 2]);
      i += 3;
    } else {
      paths.push(parts[i + 1]);
      i += 2;
    }
  }
  return paths;
}

/** Líneas agregadas por archivo, con su número de línea en la versión nueva. */
function addedLines() {
  const diff = git(["diff", "--cached", "-U0", "--no-color", "--no-ext-diff", "--diff-filter=ACMR"]);
  const out = [];
  let file = null;
  let lineNo = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const target = raw.slice(4).replace(/\t$/, "");
      file = target === "/dev/null" ? null : target.replace(/^b\//, "");
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (file && raw.startsWith("+")) {
      out.push({ file, line: lineNo, text: raw.slice(1) });
      lineNo += 1;
    }
  }
  return out;
}

const problems = [];

for (const path of stagedPaths()) {
  const reason = blockedPathReason(path);
  if (reason) problems.push(`${path} → ${reason}`);
  const size = Number(git(["cat-file", "-s", `:${path}`]).trim());
  if (size > MAX_BYTES) {
    problems.push(`${path} → archivo de ${(size / 1024 / 1024).toFixed(1)} MB (máximo ${MAX_BYTES / 1024 / 1024} MB)`);
  }
}

for (const { file, line, text } of addedLines()) {
  if (SKIP_CONTENT.some((re) => re.test(file))) continue;
  const kind = secretKindInLine(text);
  if (kind) problems.push(`${file}:${line} → ${kind}`);
}

if (problems.length > 0) {
  console.error("\n✋ Commit bloqueado: esto no puede subir al repo (es público).\n");
  for (const p of problems) console.error(`   • ${p}`);
  console.error(`
   Qué hacer:
   • Secretos: muévelos a un archivo .env* (ignorado por git) y quítalos del archivo.
   • Archivos de datos: guárdalos fuera del repo o en backups/ (ignorada). Para sacarlos
     de lo preparado: git restore --staged <archivo>
   • Si es un ejemplo inventado, agrega «${ESCAPE}» en esa línea.
   Guía: docs/SEGURIDAD-REPO.md
`);
  process.exit(1);
}
