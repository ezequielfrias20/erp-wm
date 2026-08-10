import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const FILES = {
  maracay: path.join(ROOT, "Inventario - maracay.xlsx"),
  sanJuan: path.join(ROOT, "Inventario - San Juan de los Morros.xlsx"),
};

const BRANCHES = {
  maracay: "Maracay",
  sanJuan: "San Juan de los Morros",
};

const BUCKET = "wm-public";
const IMAGE_PREFIX = "product-images";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const RESET = args.has("--reset");

function readEnv() {
  const file = fs.existsSync(".env.local") ? ".env.local" : ".env.wm.local";
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function rawValue(cell) {
  const value = cell?.value;
  if (value == null) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if (value.text) return value.text;
    if (value.result != null) return value.result;
    if (value.richText) return value.richText.map((r) => r.text).join("");
  }
  return value;
}

function text(v) {
  if (v == null) return "";
  if (v instanceof Date) return String(v.getDate());
  return String(v).replace(/\s+/g, " ").trim();
}

function clean(v) {
  const t = text(v);
  if (!t || t === "-" || t === "," || /^n\/?a$/i.test(t)) return "";
  return t;
}

function title(value) {
  const input = clean(value);
  if (!input) return "";
  const keep = new Set(["GMD", "DM", "ORL", "ECG", "HD", "IOS", "OIS", "XXS", "XS", "XL"]);
  return input
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (keep.has(upper)) return upper;
      if (/^\d/.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .replace(/\bGmd\b/g, "GMD")
    .replace(/\bValcri\b/g, "Valcri")
    .replace(/\bLittman\b|\bLiittman\b/g, "Littmann")
    .replace(/\bCaribeam\b/g, "Caribean")
    .replace(/\bStich\b/g, "Stitch");
}

function money(v) {
  if (v instanceof Date) return v.getDate();
  const t = text(v).replace(",", ".");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function qty(v) {
  const t = text(v);
  if (!t || /agotado|no disponible/i.test(t)) return 0;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function key(value) {
  return text(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value) {
  return key(value).replace(/\s+/g, "-") || "item";
}

const COLOR_HEX = new Map(
  Object.entries({
    amarillo: "#FACC15",
    "amarillo con azul": "#EAB308",
    amarilla: "#FACC15",
    azul: "#2563EB",
    "azul celeste": "#7DD3FC",
    "azul cielo": "#7DD3FC",
    "azul marino": "#1E3A8A",
    "azul oscuro": "#1E3A8A",
    "azul rey": "#1D4ED8",
    blanco: "#FFFFFF",
    cafe: "#8B5E34",
    caribean: "#14B8A6",
    coral: "#FB7185",
    dorado: "#D4AF37",
    fluorescente: "#39FF14",
    fucsia: "#D946EF",
    gris: "#9CA3AF",
    lavanda: "#C4B5FD",
    lila: "#A78BFA",
    magenta: "#DB2777",
    marron: "#7C4A2D",
    melon: "#FDBA74",
    menta: "#86EFAC",
    morado: "#7C3AED",
    naranja: "#F97316",
    negro: "#111827",
    oliva: "#708238",
    rojo: "#DC2626",
    rosado: "#F9A8D4",
    "rosado claro": "#FBCFE8",
    "rosado oscuro": "#BE185D",
    "rosa vieja": "#C08081",
    transparente: "rgba(255,255,255,0.35)",
    verde: "#22C55E",
    "verde fluorescente": "#39FF14",
    "verde olivo": "#708238",
    "verde oscuro": "#166534",
    "verde quirofano": "#0F766E",
    "verde qx": "#0F766E",
    vinotinto: "#7F1D1D",
  }),
);

function colorHex(value) {
  const k = key(value);
  if (!k) return null;
  if (COLOR_HEX.has(k)) return COLOR_HEX.get(k);
  for (const [name, hex] of COLOR_HEX) {
    if (k.includes(name)) return hex;
  }
  return null;
}

function looksColor(value) {
  return Boolean(colorHex(value));
}

const KNOWN_BRANDS = new Map(
  [
    "GMD",
    "Valcri",
    "Littmann",
    "Carditek",
    "Homelife",
    "Toons",
    "Gorro Med",
    "DM",
    "Dr John",
    "Generico",
    "Genérico",
  ].map((b) => [key(b), b === "Generico" ? "Genérico" : b]),
);

function findBrand(parts, fallback = null) {
  for (const part of parts) {
    const k = key(part);
    if (KNOWN_BRANDS.has(k)) return KNOWN_BRANDS.get(k);
    for (const [brandKey, brand] of KNOWN_BRANDS) {
      if (k.includes(brandKey) && brandKey.length > 2) return brand;
    }
  }
  return fallback;
}

function addRow(rows, row) {
  if (!row.product || !row.category || !row.branch || row.cost < 0 || row.price < 0) return;
  rows.push({
    ...row,
    category: title(row.category),
    product: title(row.product),
    brand: row.brand ? title(row.brand) : null,
    color: row.color ? title(row.color) : null,
    size: row.size ? title(row.size) : null,
    tags: [...new Set((row.tags ?? []).filter(Boolean).map(title))],
    source: row.source,
  });
}

function parseUniformRows(ws, branchKey, rows, gender) {
  for (let r = 1; r <= ws.rowCount; r++) {
    const model = clean(rawValue(ws.getCell(r, 1)));
    const color = clean(rawValue(ws.getCell(r, branchKey === "sanJuan" ? 3 : 2)));
    const size = clean(rawValue(ws.getCell(r, branchKey === "sanJuan" ? 4 : 3)));
    const bota = clean(rawValue(ws.getCell(r, branchKey === "sanJuan" ? 5 : 4)));
    const stock = qty(rawValue(ws.getCell(r, branchKey === "sanJuan" ? 6 : 5)));
    const cost = money(rawValue(ws.getCell(r, branchKey === "sanJuan" ? 7 : 6)));
    const price = money(rawValue(ws.getCell(r, branchKey === "sanJuan" ? 8 : 7)));
    if (!model || /^modelo$/i.test(model) || !color || !size || !price) continue;
    addRow(rows, {
      branch: BRANCHES[branchKey],
      category: "Uniformes",
      brand: "World Medics",
      product: `${model} ${gender} ${bota || "Sin bota"}`,
      color,
      size,
      quantity: stock,
      cost,
      price,
      tags: [gender, bota, "Uniformes"],
      source: `${ws.workbook?.title ?? ""}${ws.name}!${r}`,
    });
  }
}

function parseBatas(ws, rows) {
  let gender = "Dama";
  for (let r = 1; r <= ws.rowCount; r++) {
    const marker = clean(rawValue(ws.getCell(r, 5)));
    if (/caballero/i.test(marker)) gender = "Caballero";
    if (/dama/i.test(marker)) gender = "Dama";
    const kind = clean(rawValue(ws.getCell(r, 1)));
    const color = clean(rawValue(ws.getCell(r, 2)));
    const size = clean(rawValue(ws.getCell(r, 3)));
    const material = clean(rawValue(ws.getCell(r, 4)));
    const stock = qty(rawValue(ws.getCell(r, 5)));
    const cost = money(rawValue(ws.getCell(r, 6)));
    const price = money(rawValue(ws.getCell(r, 7)));
    if (!kind || /^costo$/i.test(kind) || !color || !size || !price) continue;
    addRow(rows, {
      branch: BRANCHES.sanJuan,
      category: "Batas médicas",
      brand: "World Medics",
      product: `${kind} ${gender} ${material || ""}`,
      color,
      size,
      quantity: stock,
      cost,
      price,
      tags: [gender, material, "Batas"],
      source: `${ws.name}!${r}`,
    });
  }
}

function parseEquipment(ws, branchKey, rows) {
  for (let r = 1; r <= ws.rowCount; r++) {
    const kind = clean(rawValue(ws.getCell(r, 1)));
    const a = clean(rawValue(ws.getCell(r, 2)));
    const b = clean(rawValue(ws.getCell(r, 3)));
    const c = clean(rawValue(ws.getCell(r, 4)));
    const stock = qty(rawValue(ws.getCell(r, branchKey === "sanJuan" ? 5 : 4)));
    const cost = money(rawValue(ws.getCell(r, branchKey === "sanJuan" ? 6 : 5)));
    const price = money(rawValue(ws.getCell(r, branchKey === "sanJuan" ? 7 : 6)));
    if (!kind || /^equipo$/i.test(kind) || /^insumos?$/i.test(kind) || !price) continue;
    const attrs = branchKey === "sanJuan" ? [a, b, c] : [a, b];
    const brand = findBrand(attrs);
    const colorPart = attrs.find((part) => looksColor(part));
    const descriptorParts = attrs.filter((part) => part && part !== brand && part !== colorPart);
    const product = [kind, ...descriptorParts].filter(Boolean).join(" ");
    addRow(rows, {
      branch: BRANCHES[branchKey],
      category: kind,
      brand,
      product,
      color: colorPart || null,
      size: descriptorParts.length > 1 ? descriptorParts.slice(1).join(" / ") : null,
      quantity: stock,
      cost,
      price,
      tags: ["Insumos médicos", kind],
      source: `${ws.name}!${r}`,
    });
  }
}

function sortedGorroImages(ws) {
  return ws
    .getImages()
    .map((image) => ({
      imageId: image.imageId,
      row: image.range?.tl?.row ?? 0,
    }))
    .sort((a, b) => a.row - b.row);
}

function mediaForImage(wb, imageId) {
  const image = wb.getImage(imageId);
  if (!image?.buffer) return null;
  return {
    buffer: image.buffer,
    extension: image.extension || "png",
  };
}

function parseGorros(ws, branchKey, rows, imagesByProduct) {
  const dataRows = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const brand = clean(rawValue(ws.getCell(r, 1)));
    const design = clean(rawValue(ws.getCell(r, 2)));
    const model = clean(rawValue(ws.getCell(r, 3)));
    const count = qty(rawValue(ws.getCell(r, branchKey === "sanJuan" ? 5 : 4)));
    const costCell = rawValue(ws.getCell(r, branchKey === "sanJuan" ? 6 : 5));
    const priceCell = rawValue(ws.getCell(r, branchKey === "sanJuan" ? 7 : 6));
    const cost = money(costCell);
    const price = money(priceCell);
    if (!brand || /^marca$/i.test(brand) || !design || !model || !price) continue;
    const product = `Gorro ${design} ${model}`;
    const row = {
      branch: BRANCHES[branchKey],
      category: "Gorros",
      brand,
      product,
      color: null,
      size: model,
      quantity: count,
      cost,
      price,
      tags: [model, "Gorros"],
      source: `${ws.name}!${r}`,
    };
    addRow(rows, row);
    dataRows.push({ rowIndex: r, product: title(product), brand: title(brand), model: title(model) });
  }

  if (branchKey === "sanJuan") {
    const images = sortedGorroImages(ws);
    for (let i = 0; i < Math.min(images.length, dataRows.length); i++) {
      const data = dataRows[i];
      const media = mediaForImage(ws.workbook, images[i].imageId);
      if (media) imagesByProduct.set(`${data.product}|${data.brand}|${data.model}`, media);
    }
  }
}

async function parseWorkbooks() {
  const rows = [];
  const imagesByProduct = new Map();

  const maracay = new ExcelJS.Workbook();
  await maracay.xlsx.readFile(FILES.maracay);
  parseUniformRows(maracay.getWorksheet("Dama"), "maracay", rows, "Dama");
  parseUniformRows(maracay.getWorksheet("Caballero"), "maracay", rows, "Caballero");
  parseEquipment(maracay.getWorksheet("Equipo"), "maracay", rows);
  parseGorros(maracay.getWorksheet("Gorros"), "maracay", rows, imagesByProduct);

  const sanJuan = new ExcelJS.Workbook();
  await sanJuan.xlsx.readFile(FILES.sanJuan);
  parseUniformRows(sanJuan.getWorksheet("Uniformes"), "sanJuan", rows, "Dama");
  parseBatas(sanJuan.getWorksheet("Batas"), rows);
  parseEquipment(sanJuan.getWorksheet("Insumos"), "sanJuan", rows);
  parseGorros(sanJuan.getWorksheet("Gorros "), "sanJuan", rows, imagesByProduct);

  return { rows, imagesByProduct };
}

function buildCatalog(rows) {
  const categories = new Map();
  const brands = new Map();
  const sizes = new Map();
  const colors = new Map();
  const products = new Map();
  const variants = new Map();
  const inventory = new Map();
  const conflicts = [];
  const baseVariantPrices = new Map();

  for (const row of rows) {
    const productKey = `${row.category}|${row.brand ?? ""}|${row.product}`;
    const variantKey = `${productKey}|${row.color ?? ""}|${row.size ?? ""}`;
    const prices = baseVariantPrices.get(variantKey) ?? new Set();
    prices.add(`${row.cost}|${row.price}`);
    baseVariantPrices.set(variantKey, prices);
  }

  for (const row of rows) {
    categories.set(row.category, { name: row.category, slug: slug(row.category) });
    if (row.brand) brands.set(row.brand, { name: row.brand });
    if (row.color && colorHex(row.color)) {
      colors.set(row.color, { name: row.color, hex: colorHex(row.color) });
    }

    const productKey = `${row.category}|${row.brand ?? ""}|${row.product}`;
    const baseVariantKey = `${productKey}|${row.color ?? ""}|${row.size ?? ""}`;
    const splitByBranch = (baseVariantPrices.get(baseVariantKey)?.size ?? 0) > 1;
    const variantSize = splitByBranch
      ? `${row.size || "Única"} · ${row.branch} · $${row.price}`
      : row.size;
    if (variantSize) sizes.set(variantSize, { label: variantSize });
    if (!products.has(productKey)) {
      products.set(productKey, {
        key: productKey,
        name: row.product,
        category: row.category,
        brand: row.brand,
        description: row.tags.length ? `Importado de Excel. Etiquetas: ${row.tags.join(", ")}.` : "Importado de Excel.",
        tags: row.tags,
      });
    }
    const product = products.get(productKey);
    product.tags = [...new Set([...product.tags, ...row.tags])];

    const variantKey = `${productKey}|${row.color ?? ""}|${variantSize ?? ""}`;
    if (!variants.has(variantKey)) {
      variants.set(variantKey, {
        key: variantKey,
        productKey,
        color: row.color,
        color_hex: row.color ? colorHex(row.color) : null,
        size: variantSize,
        cost: row.cost,
        price: row.price,
      });
    } else {
      const variant = variants.get(variantKey);
      if (variant.cost !== row.cost || variant.price !== row.price) {
        conflicts.push({
          product: row.product,
          color: row.color,
          size: row.size,
          existing: { cost: variant.cost, price: variant.price },
          incoming: { cost: row.cost, price: row.price },
          source: row.source,
        });
      }
    }

    const inventoryKey = `${variantKey}|${row.branch}`;
    inventory.set(inventoryKey, {
      key: inventoryKey,
      variantKey,
      branch: row.branch,
      quantity: (inventory.get(inventoryKey)?.quantity ?? 0) + row.quantity,
    });
  }

  return { categories, brands, sizes, colors, products, variants, inventory, conflicts };
}

function makeSku(categoryName, productName, seq) {
  const cat = key(categoryName)
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const prod = key(productName)
    .split(" ")
    .slice(0, 3)
    .map((p) => p.slice(0, 3))
    .join("")
    .slice(0, 8)
    .toUpperCase()
    .padEnd(4, "X");
  return `${cat}-${prod}-${String(seq).padStart(4, "0")}`;
}

async function ensureStorage(client) {
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw error;
  if (!buckets?.some((bucket) => bucket.name === BUCKET)) {
    const { error: createError } = await client.storage.createBucket(BUCKET, { public: true });
    if (createError) throw createError;
  }
}

async function insertData(catalog, imagesByProduct) {
  const env = readEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const keyValue = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !keyValue) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY activos.");

  const client = createClient(url, keyValue, { db: { schema: "wm" } });

  if (RESET) {
    for (const table of ["inventory", "product_variants", "products", "categories", "brands", "sizes", "colors"]) {
      const { error } = await client.from(table).delete().not("id", "is", null);
      if (error) throw new Error(`reset ${table}: ${error.message}`);
    }
    const { data: existingObjects, error: listError } = await client.storage
      .from(BUCKET)
      .list(IMAGE_PREFIX, { limit: 1000 });
    if (!listError && existingObjects?.length) {
      await client.storage
        .from(BUCKET)
        .remove(existingObjects.map((object) => `${IMAGE_PREFIX}/${object.name}`));
    }
  }

  const { data: branchRows, error: branchError } = await client
    .from("branches")
    .select("id, city");
  if (branchError) throw branchError;
  const branchByCity = new Map(branchRows.map((branch) => [branch.city, branch.id]));
  for (const name of Object.values(BRANCHES)) {
    if (!branchByCity.has(name)) throw new Error(`No encontré la sucursal ${name}.`);
  }

  const categoryRows = [...catalog.categories.values()].map((category, i) => ({
    ...category,
    sort_order: i + 1,
    is_active: true,
  }));
  const brandRows = [...catalog.brands.values()].map((brand) => ({ ...brand, is_active: true }));
  const sizeRows = [...catalog.sizes.values()].map((size, i) => ({ ...size, sort_order: i + 1 }));
  const colorRows = [...catalog.colors.values()].map((color, i) => ({ ...color, sort_order: i + 1 }));

  for (const [table, rows, conflict] of [
    ["categories", categoryRows, "name"],
    ["brands", brandRows, "name"],
    ["sizes", sizeRows, "label"],
    ["colors", colorRows, "name"],
  ]) {
    if (!rows.length) continue;
    const { error } = await client.from(table).upsert(rows, { onConflict: conflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  const [{ data: cats }, { data: brands }] = await Promise.all([
    client.from("categories").select("id, name"),
    client.from("brands").select("id, name"),
  ]);
  const catByName = new Map(cats.map((cat) => [cat.name, cat.id]));
  const brandByName = new Map(brands.map((brand) => [brand.name, brand.id]));

  const productRows = [...catalog.products.values()].map((product) => ({
    name: product.name,
    description: product.description,
    category_id: catByName.get(product.category) ?? null,
    brand_id: product.brand ? brandByName.get(product.brand) ?? null : null,
    tax_rate: 16,
    is_active: true,
    visible_in_catalog: true,
    tags: product.tags,
  }));
  if (productRows.length) {
    const { error } = await client.from("products").insert(productRows);
    if (error) throw new Error(`products: ${error.message}`);
  }

  const { data: productsDb, error: productFetchError } = await client
    .from("products")
    .select("id, name, category_id, brand_id");
  if (productFetchError) throw productFetchError;
  const productByKey = new Map();
  const catNameById = new Map([...catByName.entries()].map(([name, id]) => [id, name]));
  const brandNameById = new Map([...brandByName.entries()].map(([name, id]) => [id, name]));
  for (const product of productsDb) {
    const productKey = `${catNameById.get(product.category_id) ?? ""}|${brandNameById.get(product.brand_id) ?? ""}|${product.name}`;
    productByKey.set(productKey, product.id);
  }

  const variantRows = [];
  let seq = 1;
  for (const variant of catalog.variants.values()) {
    const productId = productByKey.get(variant.productKey);
    const product = catalog.products.get(variant.productKey);
    if (!productId || !product) continue;
    variantRows.push({
      product_id: productId,
      sku: makeSku(product.category, product.name, seq++),
      color: variant.color,
      color_hex: variant.color_hex,
      size: variant.size,
      cost: variant.cost,
      price: variant.price,
      is_active: true,
    });
  }
  if (variantRows.length) {
    const { error } = await client.from("product_variants").insert(variantRows);
    if (error) throw new Error(`product_variants: ${error.message}`);
  }

  const { data: variantsDb, error: variantFetchError } = await client
    .from("product_variants")
    .select("id, product_id, color, size");
  if (variantFetchError) throw variantFetchError;
  const variantByKey = new Map();
  const productKeyById = new Map([...productByKey.entries()].map(([k, id]) => [id, k]));
  for (const variant of variantsDb) {
    const productKeyValue = productKeyById.get(variant.product_id);
    if (!productKeyValue) continue;
    variantByKey.set(`${productKeyValue}|${variant.color ?? ""}|${variant.size ?? ""}`, variant.id);
  }

  const inventoryRows = [...catalog.inventory.values()]
    .map((item) => ({
      variant_id: variantByKey.get(item.variantKey),
      branch_id: branchByCity.get(item.branch),
      quantity: item.quantity,
      reserved: 0,
      min_stock: 0,
    }))
    .filter((item) => item.variant_id && item.branch_id);
  if (inventoryRows.length) {
    const { error } = await client
      .from("inventory")
      .upsert(inventoryRows, { onConflict: "variant_id,branch_id" });
    if (error) throw new Error(`inventory: ${error.message}`);
  }

  await ensureStorage(client);
  let uploadedImages = 0;
  for (const [imageKey, media] of imagesByProduct.entries()) {
    const [productName, brand, model] = imageKey.split("|");
    const productKeyValue = `Gorros|${brand}|${productName}`;
    const productId = productByKey.get(productKeyValue);
    if (!productId) continue;
    const ext = media.extension === "jpeg" ? "jpg" : media.extension;
    const objectPath = `${IMAGE_PREFIX}/${productId}.${ext}`;
    const { error } = await client.storage.from(BUCKET).upload(objectPath, media.buffer, {
      contentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
      upsert: true,
      cacheControl: "3600",
    });
    if (error) throw new Error(`storage ${productName} ${model}: ${error.message}`);
    uploadedImages++;
  }

  return {
    categories: categoryRows.length,
    brands: brandRows.length,
    sizes: sizeRows.length,
    colors: colorRows.length,
    products: productRows.length,
    variants: variantRows.length,
    inventory: inventoryRows.length,
    uploadedImages,
  };
}

async function main() {
  const { rows, imagesByProduct } = await parseWorkbooks();
  const catalog = buildCatalog(rows);

  const byBranch = rows.reduce((acc, row) => {
    acc[row.branch] = (acc[row.branch] ?? 0) + row.quantity;
    return acc;
  }, {});
  const summary = {
    sourceRows: rows.length,
    sourceUnits: rows.reduce((sum, row) => sum + row.quantity, 0),
    byBranch,
    categories: catalog.categories.size,
    brands: catalog.brands.size,
    sizes: catalog.sizes.size,
    colors: catalog.colors.size,
    products: catalog.products.size,
    variants: catalog.variants.size,
    inventoryRows: catalog.inventory.size,
    sanJuanGorroImages: imagesByProduct.size,
    conflicts: catalog.conflicts.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (catalog.conflicts.length) {
    console.log("CONFLICTS_SAMPLE");
    console.log(JSON.stringify(catalog.conflicts.slice(0, 20), null, 2));
  }

  if (APPLY) {
    const result = await insertData(catalog, imagesByProduct);
    console.log("APPLIED");
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("DRY_RUN_ONLY");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
