/**
 * Foto mínima del catálogo con casos reales de producción (2026-11-11), para los tests de la
 * propuesta y del Excel de revisión.
 */
import type { CatalogSnapshot, SnapshotProduct, SnapshotVariant } from "./types";

let tick = 0;
const nextDate = () => new Date(Date.UTC(2026, 7, 1, 0, 0, tick++)).toISOString();

function product(
  id: string,
  name: string,
  category_id: string | null,
  brand_id: string | null,
  has_image = false,
): SnapshotProduct {
  const at = nextDate();
  return {
    id,
    name,
    description: null,
    category_id,
    brand_id,
    is_active: true,
    visible_in_catalog: true,
    has_image,
    created_at: at,
    updated_at: at,
  };
}

function variant(
  product_id: string,
  sku: string,
  color: string | null,
  size: string | null,
  sale_lines = 0,
  stock: Record<string, number> = {},
): SnapshotVariant {
  const at = nextDate();
  return {
    id: `v-${sku}`,
    product_id,
    sku,
    color,
    color_hex: null,
    size,
    price: 10,
    cost: 5,
    is_active: true,
    stock,
    sale_lines,
    created_at: at,
    updated_at: at,
  };
}

const products: SnapshotProduct[] = [
  product("p1", "Mao Stretch Dama Recta", "c-uni", "br-wm"),
  product("p15", "Mao Mic Dama Recta", "c-uni", "br-wm"),
  product("p2", "Figs Dama", "c-uni", "br-figs", true),
  product("p3", "Figs Dama", null, null, true),
  product("p4", "Gorro Baby Yoda Moño", "c-gor", "br-gm"),
  product("p5", "Gorro Baby Yoda Tiras", "c-gor", "br-gm"),
  product("p6", "gorro anestesia azul tiras", "c-gor", "br-gm"),
  product("p14", "Gorro Cafe Elastica", "c-gor", "br-gm"),
  product("p7", "Tensiometro GMD Digital Con Voz", "c-ten", "br-gmd"),
  product("p8", "Oximetro", "c-oxi", "br-gmd"),
  product("p9", "Oximetro", "c-oxi", "br-dj"),
  product("p10", "Rompe Ampollas 3D Bob Sponja", "c-rom", null),
  product("p11", "Medias Compresivas 15-20 Mmhg S-m Batido Amarrillo", "c-med", null),
  product("p12", "Tijeras Trauma GMD Tornasol Morada", "c-tij", null),
  product("p13", "Tijeras Trauma GMD Tornasol Negra", "c-tij", null),
];

const variants: SnapshotVariant[] = [
  variant("p1", "UNI-MAOSTR-0017", "Amarillo", "M", 2, { b1: 0 }),
  variant("p1", "UNI-MAOSTR-0018", "Amarillo", "M"),
  variant("p1", "UXX-MAOSTRDA-0469", "Vinotinto", "XS · San Juan de los Morros · $35", 1, { b2: 0 }),
  variant("p15", "UNI-MAOMIC-0001", "mostaza", "S"),
  variant("p15", "UNI-MAOMIC-0002", "Mostaza", "S"),
  variant("p2", "UNI-FIGDAM-0044", "Amatista", "XS"),
  variant("p3", "UNI-FIGDAM-0075", "Azul Cielo", "L"),
  variant("p4", "GXX-1", null, "Moño"),
  variant("p5", "GXX-2", null, "Tiras"),
  variant("p6", "GXX-3", null, null),
  variant("p14", "GXX-4", null, "Elastica"),
  variant("p7", "TXX-0257", null, "Con Voz"),
  variant("p8", "OXX-1", null, null, 3),
  variant("p8", "OXX-2", null, null),
  variant("p9", "OXX-3", null, null),
  variant("p10", "RAX-0295", null, "Bob Sponja"),
  variant("p11", "MCX-0632", null, "S-m / Batido Amarrillo"),
  variant("p12", "TTX-0348", null, "Morada"),
  variant("p13", "TTX-0347", null, "Negra"),
];

export const MINI_SNAPSHOT: CatalogSnapshot = {
  taken_at: "2026-11-11T12:00:00.000Z",
  branches: [
    { id: "b1", name: "Maracay" },
    { id: "b2", name: "San Juan de los Morros" },
  ],
  categories: [
    { id: "c-uni", name: "Uniformes" },
    { id: "c-gor", name: "Gorros" },
    { id: "c-ten", name: "Tensiometro" },
    { id: "c-oxi", name: "Oximetro" },
    { id: "c-rom", name: "Rompe Ampollas" },
    { id: "c-med", name: "Medias Compresivas" },
    { id: "c-tij", name: "Tijeras Trauma" },
  ],
  brands: [
    { id: "br-wm", name: "World Medics" },
    { id: "br-figs", name: "Figs" },
    { id: "br-gm", name: "Gorro Med" },
    { id: "br-gmd", name: "GMD" },
    { id: "br-dj", name: "Dr John" },
  ],
  colors: [
    { id: "col-1", name: "Amarillo", hex: "#FACC15" },
    { id: "col-2", name: "Negro", hex: "#111827" },
    { id: "col-3", name: "Azul Cielo", hex: "#7DD3FC" },
    { id: "col-4", name: "mostaza", hex: "#0EA5E9" },
    { id: "col-5", name: "Mostaza", hex: "#0EA5E9" },
  ],
  products,
  variants,
};
