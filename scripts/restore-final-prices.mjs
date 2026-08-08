import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const TAX_RATE = 0.16;

function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    const value = line.slice(index + 1).replace(/^"|"$/g, "");
    env[key] = value;
  }
  return env;
}

function finalPrice(price) {
  return Math.ceil(Number(price) * (1 + TAX_RATE));
}

async function fetchAll(supabase) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, sku, price, cost")
      .order("sku")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

async function main() {
  const env = parseEnv(await fs.readFile(".env.local", "utf8"));
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local.");
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    db: { schema: "wm" },
  });

  const rows = await fetchAll(supabase);
  const nonIntegerPrices = rows.filter((row) => Math.abs(Number(row.price) - Math.round(Number(row.price))) > 0.001);
  if (APPLY && !FORCE && nonIntegerPrices.length / Math.max(rows.length, 1) < 0.5) {
    throw new Error(
      "Los precios ya parecen estar en modo final. Usa --force solo si realmente quieres recalcular sobre precios enteros.",
    );
  }

  const changes = rows
    .map((row) => ({
      id: row.id,
      sku: row.sku,
      old_price: Number(row.price),
      new_price: finalPrice(row.price),
      cost: Number(row.cost),
    }))
    .filter((row) => row.old_price !== row.new_price);

  const backupDir = path.join(process.cwd(), "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `product-variant-prices-before-final-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  await fs.writeFile(backupPath, JSON.stringify(changes, null, 2));

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        total_variants: rows.length,
        non_integer_prices: nonIntegerPrices.length,
        changes: changes.length,
        backup: backupPath,
        samples: changes.slice(0, 12),
      },
      null,
      2,
    ),
  );

  if (!APPLY) return;

  for (const change of changes) {
    const { error } = await supabase
      .from("product_variants")
      .update({ price: change.new_price })
      .eq("id", change.id);
    if (error) throw error;
  }

  const after = await fetchAll(supabase);
  const expected = new Map(changes.map((row) => [row.id, row.new_price]));
  const mismatches = after.filter(
    (row) => expected.has(row.id) && Number(row.price) !== expected.get(row.id),
  );
  console.log(
    JSON.stringify(
      {
        applied: changes.length,
        mismatches: mismatches.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
