#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import ExcelJS from "exceljs";
import dotenv from "dotenv";

const FILES = [
  { path: "Inventario-Maracay.xlsx", branchCode: "S01", branchName: "Maracay" },
  {
    path: "Inventario-San Juan de los Morros.xlsx",
    branchCode: "SJ",
    branchName: "San Juan de los Morros",
  },
];

const MODE = process.argv.includes("--import") ? "import" : "dry-run";

const CATEGORY_COLORS = {
  "Uniformes Dama": "#ec4899",
  "Uniformes Caballero": "#2563eb",
  Batas: "#14b8a6",
  Insumos: "#f59e0b",
  Gorros: "#8b5cf6",
};

const COMMON_COLORS = new Set(
  [
    "amarillo",
    "amazonas",
    "azul",
    "azul celeste",
    "azul cielo",
    "azul marino",
    "azul rey",
    "beige",
    "blanco",
    "cafe",
    "caqui",
    "caribean",
    "caribean claro",
    "caribean oscuro",
    "celeste",
    "coral",
    "dorado",
    "fucsia",
    "gris",
    "gris claro",
    "gris plomo",
    "lila",
    "magenta",
    "marron",
    "menta",
    "morado",
    "naranja",
    "negro",
    "rojo",
    "rosa palo",
    "rosado",
    "tierra",
    "tierra claro",
    "transparente",
    "verde",
    "verde manzana",
    "verde oliva",
    "verde olivo",
    "verde oscuro",
    "verde quirofano",
    "vinotinto",
  ].map((v) => v.toLowerCase()),
);

function text(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value) return text(value.text);
    if ("result" in value) return text(value.result);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    return "";
  }
  return String(value);
}

function rawCell(row, col) {
  return text(row.getCell(col).value);
}

function clean(value) {
  return text(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();
}

function cleanToken(value) {
  return clean(value)
    .replace(/\s*\*+\s*$/g, "")
    .replace(/^,+|,+$/g, "")
    .trim();
}

function titleWord(word) {
  const upper = word.toUpperCase();
  if (["XXS", "XS", "S", "M", "L", "XL", "XXL", "GMD", "DM", "WM", "ORL"].includes(upper)) {
    return upper;
  }
  if (/^\d+[a-z]?$/i.test(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCase(value) {
  return cleanToken(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.split("-").map(titleWord).join("-"))
    .join(" ");
}

function normalizeSize(value) {
  const v = cleanToken(value);
  if (!v || v === "-") return "";
  const upper = v.toUpperCase();
  if (["XXS", "XS", "S", "M", "L", "XL", "XXL"].includes(upper)) return upper;
  return titleCase(v);
}

function normalizeModel(value) {
  return titleCase(value);
}

function normalizeColor(value) {
  let v = cleanToken(value);
  if (!v || v === "-" || v === ".") return "";
  v = v.replace(/\s*-\s*/g, " - ");
  const lower = v.toLowerCase();
  const aliases = new Map([
    ["caribeam", "Caribean"],
    ["caribean", "Caribean"],
    ["negra", "Negro"],
    ["blanca", "Blanco"],
    ["morada", "Morado"],
    ["rosada", "Rosado"],
    ["dorada", "Dorado"],
    ["verde olivo", "Verde Olivo"],
    ["verde oliva", "Verde Olivo"],
    ["verde qx", "Verde Quirofano"],
    ["verde quirofano", "Verde Quirofano"],
    ["florocente", "Fluorescente"],
  ]);
  if (aliases.has(lower)) return aliases.get(lower);
  return titleCase(v);
}

function normalizeBota(value) {
  const v = cleanToken(value);
  if (!v || v === "-") return "";
  return titleCase(v);
}

function parseQty(value) {
  const v = clean(value);
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower.includes("agotado") || lower.includes("no disponible")) return 0;
  const n = Number(v.replace(",", "."));
  if (Number.isFinite(n)) return Math.max(0, Math.trunc(n));
  return null;
}

function slug(value, max = 28) {
  const ascii = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (ascii || "item").slice(0, max).replace(/-+$/g, "");
}

function skuFor(row) {
  const cat = slug(row.category, 3).toUpperCase();
  const productName = row.productName ?? row.product_name;
  const base = slug(productName, 24).toUpperCase();
  const hash = crypto
    .createHash("sha1")
    .update([productName, row.size, row.color].join("|").toLowerCase())
    .digest("hex")
    .slice(0, 7)
    .toUpperCase();
  return `WM-${cat}-${base}-${hash}`;
}

function pushRow(rows, source, data) {
  const productName = clean(data.productName);
  const category = clean(data.category);
  const quantity = data.quantity;
  if (!productName || !category || quantity == null) return;
  const row = {
    source_file: source.file,
    source_sheet: source.sheet,
    source_row: source.row,
    branch_code: source.branchCode,
    category,
    product_name: productName,
    description: data.description || null,
    size: normalizeSize(data.size),
    color: normalizeColor(data.color),
    barcode: clean(data.barcode) || null,
    quantity,
  };
  row.sku = skuFor(row);
  rows.push(row);
}

function looksLikeColor(value) {
  const c = normalizeColor(value);
  if (!c) return false;
  const lower = c.toLowerCase();
  if (COMMON_COLORS.has(lower)) return true;
  return [...COMMON_COLORS].some((known) => lower.includes(known));
}

function meaningful(value) {
  const v = cleanToken(value);
  return v && v !== "-" && v !== "," && v.toLowerCase() !== "x" ? titleCase(v) : "";
}

function uniformName(gender, model, bota) {
  return [`Uniforme ${gender}`, normalizeModel(model), bota ? `Bota ${normalizeBota(bota)}` : ""]
    .filter(Boolean)
    .join(" - ");
}

function bataName(gender, model, material) {
  return [`Bata ${gender}`, normalizeModel(model), meaningful(material)].filter(Boolean).join(" - ");
}

function insumoName(parts) {
  return parts.map(meaningful).filter(Boolean).join(" - ");
}

function gorroName(name) {
  return ["Gorro", titleCase(name)].filter(Boolean).join(" - ");
}

async function parseMaracay(workbook, fileInfo, rows) {
  for (const sheetName of ["Dama", "Caballero"]) {
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) continue;
    const gender = sheetName === "Dama" ? "Dama" : "Caballero";
    let section = "uniformes";
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const c1 = clean(rawCell(row, 1));
      const joined = [1, 2, 3, 4, 5].map((i) => clean(rawCell(row, i))).join(" ").toLowerCase();
      if (joined.includes("batas medicas")) {
        section = "batas";
        return;
      }
      if (!c1 || c1.toLowerCase() === "modelo") return;
      if (section === "uniformes") {
        const quantity = parseQty(rawCell(row, 5));
        pushRow(rows, { file: fileInfo.path, sheet: sheetName, row: rowNumber, branchCode: fileInfo.branchCode }, {
          category: `Uniformes ${gender}`,
          productName: uniformName(gender, c1, rawCell(row, 4)),
          color: rawCell(row, 2),
          size: rawCell(row, 3),
          quantity,
        });
      } else {
        const quantity = parseQty(rawCell(row, 4));
        pushRow(rows, { file: fileInfo.path, sheet: sheetName, row: rowNumber, branchCode: fileInfo.branchCode }, {
          category: "Batas",
          productName: bataName(gender, c1, ""),
          color: rawCell(row, 2),
          size: rawCell(row, 3),
          quantity,
        });
      }
    });
  }

  const equipo = workbook.getWorksheet("Equipo");
  if (equipo) {
    equipo.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const item = clean(rawCell(row, 1));
      if (!item || item.toLowerCase() === "equipo") return;
      const quantity = parseQty(rawCell(row, 4));
      const color = looksLikeColor(rawCell(row, 3)) ? rawCell(row, 3) : "";
      pushRow(rows, { file: fileInfo.path, sheet: "Equipo", row: rowNumber, branchCode: fileInfo.branchCode }, {
        category: "Insumos",
        productName: insumoName([item, rawCell(row, 2), color ? "" : rawCell(row, 3)]),
        color,
        quantity,
      });
    });
  }

  const gorros = workbook.getWorksheet("Gorros");
  if (gorros) {
    gorros.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const name = clean(rawCell(row, 2));
      if (!name || name.toLowerCase() === "gorro") return;
      const quantity = parseQty(rawCell(row, 5));
      pushRow(rows, { file: fileInfo.path, sheet: "Gorros", row: rowNumber, branchCode: fileInfo.branchCode }, {
        category: "Gorros",
        productName: gorroName(name),
        size: rawCell(row, 3),
        barcode: rawCell(row, 4),
        quantity,
      });
    });
  }
}

async function parseSanJuan(workbook, fileInfo, rows) {
  const uniformes = workbook.getWorksheet("Uniformes");
  if (uniformes) {
    let gender = "Dama";
    uniformes.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const joined = [1, 2, 3, 4, 5, 6].map((i) => clean(rawCell(row, i))).join(" ").toLowerCase();
      if (joined.includes("uniforme caballero")) {
        gender = "Caballero";
        return;
      }
      const model = clean(rawCell(row, 1));
      if (!model || model.toLowerCase() === "modelo" || /^talla/i.test(model)) return;
      const quantity = parseQty(rawCell(row, 6));
      pushRow(rows, { file: fileInfo.path, sheet: "Uniformes", row: rowNumber, branchCode: fileInfo.branchCode }, {
        category: `Uniformes ${gender}`,
        productName: uniformName(gender, model, rawCell(row, 5)),
        color: rawCell(row, 3),
        size: rawCell(row, 4),
        quantity,
      });
    });
  }

  const batas = workbook.getWorksheet("Batas");
  if (batas) {
    let gender = "Dama";
    let currentSize = "";
    batas.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const label = clean(rawCell(row, 5)) || clean(rawCell(row, 6));
      const labelLower = label.toLowerCase();
      if (labelLower.includes("dama")) gender = "Dama";
      if (labelLower.includes("caballero")) gender = "Caballero";
      const sizeMatch = label.match(/\b(XXS|XS|S|M|L|XL|XXL)\b/i);
      if (sizeMatch) currentSize = normalizeSize(sizeMatch[1]);

      const model = clean(rawCell(row, 1));
      if (!model || model.toLowerCase() === "modelo" || model.toLowerCase().includes("batas medicas")) return;
      const quantity = parseQty(rawCell(row, 5));
      pushRow(rows, { file: fileInfo.path, sheet: "Batas", row: rowNumber, branchCode: fileInfo.branchCode }, {
        category: "Batas",
        productName: bataName(gender, model, rawCell(row, 4)),
        color: rawCell(row, 2),
        size: rawCell(row, 3) || currentSize,
        quantity,
      });
    });
  }

  const insumos = workbook.getWorksheet("Insumos");
  if (insumos) {
    insumos.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const c1 = clean(rawCell(row, 1));
      if (!c1 || ["insumos", "medicos"].includes(c1.toLowerCase())) return;
      const quantity = parseQty(rawCell(row, 5));
      const category = c1.toLowerCase().startsWith("gorro") ? "Gorros" : "Insumos";
      if (category === "Gorros") {
        pushRow(rows, { file: fileInfo.path, sheet: "Insumos", row: rowNumber, branchCode: fileInfo.branchCode }, {
          category,
          productName: gorroName(rawCell(row, 2)),
          size: rawCell(row, 3),
          quantity,
        });
        return;
      }
      const candidates = [rawCell(row, 2), rawCell(row, 3), rawCell(row, 4)];
      const color = candidates.find(looksLikeColor) || "";
      const productParts = [c1, ...candidates.filter((p) => normalizeColor(p) !== normalizeColor(color))];
      pushRow(rows, { file: fileInfo.path, sheet: "Insumos", row: rowNumber, branchCode: fileInfo.branchCode }, {
        category,
        productName: insumoName(productParts),
        color,
        quantity,
      });
    });
  }

  const gorros = workbook.getWorksheet("Gorros WM");
  if (gorros) {
    gorros.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const name = clean(rawCell(row, 1));
      if (!name || name.toLowerCase() === "gorros") return;
      const quantity = parseQty(rawCell(row, 4));
      pushRow(rows, { file: fileInfo.path, sheet: "Gorros WM", row: rowNumber, branchCode: fileInfo.branchCode }, {
        category: "Gorros",
        productName: gorroName(name),
        size: rawCell(row, 2),
        barcode: rawCell(row, 3),
        quantity,
      });
    });
  }
}

function aggregateRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = [row.sku, row.branch_code].join("|");
    const current = map.get(key);
    if (current) {
      current.quantity += row.quantity;
      current.source_rows.push(`${row.source_file}:${row.source_sheet}:${row.source_row}`);
    } else {
      map.set(key, { ...row, source_rows: [`${row.source_file}:${row.source_sheet}:${row.source_row}`] });
    }
  }
  return [...map.values()].sort((a, b) =>
    [a.category, a.product_name, a.size, a.color, a.branch_code].join("|").localeCompare(
      [b.category, b.product_name, b.size, b.color, b.branch_code].join("|"),
      "es",
    ),
  );
}

function sqlString(value) {
  if (value == null) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSql(rows) {
  const json = JSON.stringify(rows).replace(/\$/g, "\\u0024");
  const categoryRows = Object.entries(CATEGORY_COLORS)
    .map(
      ([name, color], index) =>
        `(${sqlString(name)}, ${sqlString(slug(name))}, ${sqlString(color)}, ${index + 1}, true)`,
    )
    .join(",\n    ");
  const finish = MODE === "import" ? "commit;" : "rollback;";

  return `
\\set ON_ERROR_STOP on
begin;

create temp table _inventory_import (
  source_file text,
  source_sheet text,
  source_row int,
  branch_code text,
  category text,
  product_name text,
  description text,
  size text,
  color text,
  barcode text,
  quantity int,
  sku text,
  source_rows text[]
) on commit drop;

insert into _inventory_import
select *
from jsonb_to_recordset($json$${json}$json$::jsonb) as r(
  source_file text,
  source_sheet text,
  source_row int,
  branch_code text,
  category text,
  product_name text,
  description text,
  size text,
  color text,
  barcode text,
  quantity int,
  sku text,
  source_rows text[]
);

insert into wm.categories (name, slug, color, sort_order, is_active)
values
    ${categoryRows}
on conflict (name) do update
set slug = coalesce(wm.categories.slug, excluded.slug),
    color = coalesce(wm.categories.color, excluded.color),
    is_active = true,
    updated_at = now();

insert into wm.brands (name, is_active)
values ('WM', true)
on conflict (name) do update set is_active = true, updated_at = now();

with incoming as (
  select distinct size as label
  from _inventory_import
  where nullif(size, '') is not null
),
ordered as (
  select label, row_number() over (order by label) as rn
  from incoming
)
insert into wm.sizes (label, sort_order)
select label, (select coalesce(max(sort_order), 0) from wm.sizes) + rn
from ordered
on conflict (label) do nothing;

with incoming as (
  select distinct color as name
  from _inventory_import
  where nullif(color, '') is not null
),
ordered as (
  select name, row_number() over (order by name) as rn
  from incoming
)
insert into wm.colors (name, sort_order)
select name, (select coalesce(max(sort_order), 0) from wm.colors) + rn
from ordered
on conflict (name) do nothing;

with incoming as (
  select distinct i.product_name, i.category, i.description
  from _inventory_import i
),
to_insert as (
  select incoming.*
  from incoming
  where not exists (
    select 1 from wm.products p where lower(trim(p.name)) = lower(trim(incoming.product_name))
  )
)
insert into wm.products (name, description, category_id, brand_id, tax_rate, is_active, visible_in_catalog, tags)
select
  t.product_name,
  t.description,
  c.id,
  b.id,
  16,
  true,
  true,
  array[t.category]
from to_insert t
join wm.categories c on c.name = t.category
join wm.brands b on b.name = 'WM';

with incoming as (
  select distinct on (sku)
    sku,
    product_name,
    nullif(color, '') as color,
    nullif(size, '') as size,
    nullif(barcode, '') as barcode
  from _inventory_import
  order by sku, source_file, source_sheet, source_row
)
insert into wm.product_variants (product_id, sku, color, color_hex, size, barcode, price, cost, is_active)
select p.id, i.sku, i.color, null, i.size, i.barcode, 30, 10, true
from incoming i
join wm.products p on lower(trim(p.name)) = lower(trim(i.product_name))
on conflict (sku) do update
set product_id = excluded.product_id,
    color = excluded.color,
    size = excluded.size,
    barcode = coalesce(excluded.barcode, wm.product_variants.barcode),
    is_active = true,
    updated_at = now();

with incoming as (
  select
    sku,
    branch_code,
    sum(quantity)::int as quantity
  from _inventory_import
  group by sku, branch_code
)
insert into wm.inventory (variant_id, branch_id, quantity, reserved, min_stock, updated_at)
select pv.id, br.id, i.quantity, 0, 0, now()
from incoming i
join wm.product_variants pv on pv.sku = i.sku
join wm.branches br on br.code = i.branch_code
on conflict (variant_id, branch_id) do update
set quantity = excluded.quantity,
    updated_at = now();

select '${MODE}' as mode,
  (select count(distinct category) from _inventory_import) as categories_seen,
  (select count(distinct product_name) from _inventory_import) as products_seen,
  (select count(distinct sku) from _inventory_import) as variants_seen,
  (select count(*) from _inventory_import) as inventory_rows_seen,
  (select sum(quantity) from _inventory_import) as units_seen;

select category, count(distinct product_name) as products, count(distinct sku) as variants, sum(quantity) as units
from _inventory_import
group by category
order by category;

select br.city as branch, count(*) as inventory_rows, sum(i.quantity) as units
from _inventory_import ii
join wm.product_variants pv on pv.sku = ii.sku
join wm.branches br on br.code = ii.branch_code
join wm.inventory i on i.variant_id = pv.id and i.branch_id = br.id
group by br.city
order by br.city;

${finish}
`;
}

function readDbConfig() {
  const parsed = dotenv.parse(fs.readFileSync(".env.local"));
  const raw = (parsed.SUPABASE_DB_URL || "").replace(/&amp;/g, "&").trim();
  const match = raw.match(/^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:/]+):(\d+)\/([^?\s]+).*$/);
  if (!match) throw new Error("No pude interpretar SUPABASE_DB_URL en .env.local");
  const [, user, password, host, port, db] = match;
  return { user, password, host, port, db };
}

async function main() {
  const rows = [];
  for (const fileInfo of FILES) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fileInfo.path);
    if (fileInfo.branchCode === "S01") await parseMaracay(workbook, fileInfo, rows);
    if (fileInfo.branchCode === "SJ") await parseSanJuan(workbook, fileInfo, rows);
  }

  const aggregated = aggregateRows(rows);
  const summary = {
    mode: MODE,
    sourceRowsParsed: rows.length,
    importRows: aggregated.length,
    categories: [...new Set(aggregated.map((r) => r.category))].sort(),
    products: new Set(aggregated.map((r) => r.product_name)).size,
    variants: new Set(aggregated.map((r) => r.sku)).size,
    units: aggregated.reduce((sum, r) => sum + r.quantity, 0),
    branches: Object.fromEntries(
      FILES.map((file) => [
        file.branchName,
        aggregated
          .filter((r) => r.branch_code === file.branchCode)
          .reduce((sum, r) => sum + r.quantity, 0),
      ]),
    ),
    sizes: [...new Set(aggregated.map((r) => r.size).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "es"),
    ),
    colors: [...new Set(aggregated.map((r) => r.color).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "es"),
    ),
    sample: aggregated.slice(0, 12).map((r) => ({
      branch: r.branch_code,
      category: r.category,
      product: r.product_name,
      size: r.size,
      color: r.color,
      quantity: r.quantity,
      sku: r.sku,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));

  const config = readDbConfig();
  const sql = buildSql(aggregated);
  const res = spawnSync(
    "psql",
    [
      "-h",
      config.host,
      "-p",
      config.port,
      "-U",
      config.user,
      "-d",
      config.db,
      "-P",
      "pager=off",
    ],
    {
      input: sql,
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: config.password },
      maxBuffer: 1024 * 1024 * 20,
    },
  );
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(res.status ?? 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
