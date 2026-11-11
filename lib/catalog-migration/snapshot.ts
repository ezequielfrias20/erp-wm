import { readFile } from "node:fs/promises";
import type { CatalogSnapshot, SnapshotVariant } from "./types";

const SECTIONS = ["branches", "categories", "brands", "colors", "products", "variants"] as const;

/** Valida la forma de la foto y normaliza los números (Postgres puede devolver numeric como texto). */
export function parseSnapshot(raw: unknown): CatalogSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("La foto del catálogo no es un objeto JSON.");
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.taken_at !== "string") {
    throw new Error("La foto del catálogo no tiene «taken_at».");
  }
  for (const section of SECTIONS) {
    if (!Array.isArray(obj[section])) {
      throw new Error(`La foto del catálogo no tiene la sección «${section}».`);
    }
  }

  const variants = (obj.variants as Record<string, unknown>[]).map((v): SnapshotVariant => {
    const stock: Record<string, number> = {};
    for (const [branchId, qty] of Object.entries((v.stock ?? {}) as Record<string, unknown>)) {
      stock[branchId] = Number(qty);
    }
    return {
      ...(v as unknown as SnapshotVariant),
      price: Number(v.price),
      cost: Number(v.cost),
      stock,
      sale_lines: Number(v.sale_lines),
    };
  });

  return { ...(obj as unknown as CatalogSnapshot), variants };
}

export async function loadSnapshot(path: string): Promise<CatalogSnapshot> {
  return parseSnapshot(JSON.parse(await readFile(path, "utf8")));
}
