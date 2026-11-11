/**
 * Taxonomía propuesta para World Medics, como datos. Es la base de la propuesta del Excel de
 * revisión (la tienda la corrige) y la aplica la limpieza (plan 2). NO va al bootstrap
 * multi-negocio: es propia de este negocio.
 *
 * Spec: docs/superpowers/specs/2026-11-11-catalogo-listo-ecommerce-design.md
 */

export type OptionTypeCode = "talla" | "amarre";

export type AttributeDef = { code: string; name: string; isMulti: boolean; values: string[] };

export type CategoryDef = {
  department: string;
  name: string;
  optionType: OptionTypeCode | null;
  requiresColor: boolean;
  attributes: { code: string; required: boolean }[];
};

export type ColorDef = { name: string; hex: string; family: string; aliases: string[] };

export type BrandDef = { name: string; aliases: RegExp[]; lines: string[] };

/** `category` es un path «Departamento › Categoría». */
export type KeywordRule = { pattern: RegExp; category: string };

export type AttributeKeyword = { attribute: string; value: string; pattern: RegExp };

export type Taxonomy = {
  departments: string[];
  categories: CategoryDef[];
  attributes: AttributeDef[];
  optionValues: Record<OptionTypeCode, string[]>;
  /** normalizeKey(texto) → etiqueta canónica. */
  optionAliases: Record<string, string>;
  colorFamilies: string[];
  colors: ColorDef[];
  brands: BrandDef[];
  /** Nombre de categoría actual → path nuevo. */
  legacyCategoryMap: Record<string, string>;
  /** Se prueban si la categoría actual es «Uniformes» (o no hay). */
  uniformOverrides: KeywordRule[];
  /** Se prueban sobre normalizeKey(nombre) si el producto no tiene categoría o es «Uniformes». */
  nameCategoryRules: KeywordRule[];
  /** Se prueban sobre normalizeKey(nombre); el orden importa dentro de cada atributo. */
  attributeKeywords: AttributeKeyword[];
};

export const PATH_SEP = " › ";

export function categoryPath(c: Pick<CategoryDef, "department" | "name">): string {
  return `${c.department}${PATH_SEP}${c.name}`;
}

export function findCategory(tax: Taxonomy, path: string): CategoryDef | undefined {
  return tax.categories.find((c) => categoryPath(c) === path);
}

// ── Departamentos y categorías ──────────────────────────────────────────────

const UNI = "Uniformes";
const EQ = "Equipos médicos";
const ACC = "Accesorios";

const req = (code: string) => ({ code, required: true });
const opt = (code: string) => ({ code, required: false });

const CATEGORIES: CategoryDef[] = [
  { department: UNI, name: "Conjuntos", optionType: "talla", requiresColor: true, attributes: [req("genero"), req("corte"), req("tela")] },
  { department: UNI, name: "Batas y chaquetas", optionType: "talla", requiresColor: true, attributes: [req("genero"), req("largo"), opt("tela")] },
  { department: UNI, name: "Gorros", optionType: "amarre", requiresColor: false, attributes: [req("tematica"), opt("genero"), opt("especialidad")] },
  { department: UNI, name: "Medias de compresión", optionType: "talla", requiresColor: false, attributes: [] },
  { department: EQ, name: "Estetoscopios", optionType: null, requiresColor: false, attributes: [opt("publico")] },
  { department: EQ, name: "Tensiómetros", optionType: null, requiresColor: false, attributes: [req("tipo_tensiometro"), opt("voz")] },
  { department: EQ, name: "Oxímetros", optionType: null, requiresColor: false, attributes: [opt("publico")] },
  { department: EQ, name: "Termómetros", optionType: null, requiresColor: false, attributes: [req("tipo_termometro"), opt("publico")] },
  { department: EQ, name: "Otoscopios y ORL", optionType: null, requiresColor: false, attributes: [] },
  { department: EQ, name: "Glucómetros y consumibles", optionType: null, requiresColor: false, attributes: [] },
  { department: EQ, name: "Exploración física", optionType: null, requiresColor: false, attributes: [] },
  { department: EQ, name: "Terapia y rehabilitación", optionType: null, requiresColor: false, attributes: [] },
  { department: EQ, name: "Instrumental y práctica", optionType: null, requiresColor: false, attributes: [] },
  { department: EQ, name: "Repuestos y accesorios de equipos", optionType: null, requiresColor: false, attributes: [] },
  { department: ACC, name: "Identificación", optionType: null, requiresColor: false, attributes: [] },
  { department: ACC, name: "Bolsos y morrales", optionType: null, requiresColor: false, attributes: [] },
  { department: ACC, name: "Papelería", optionType: null, requiresColor: false, attributes: [] },
  { department: ACC, name: "Otros accesorios", optionType: null, requiresColor: false, attributes: [] },
];

const P = (department: string, name: string) => categoryPath({ department, name });
const CONJUNTOS = P(UNI, "Conjuntos");
const BATAS = P(UNI, "Batas y chaquetas");
const GORROS = P(UNI, "Gorros");
const MEDIAS = P(UNI, "Medias de compresión");
const ESTETOS = P(EQ, "Estetoscopios");
const TENSIO = P(EQ, "Tensiómetros");
const OXI = P(EQ, "Oxímetros");
const TERMO = P(EQ, "Termómetros");
const OTO = P(EQ, "Otoscopios y ORL");
const GLUCO = P(EQ, "Glucómetros y consumibles");
const EXPLO = P(EQ, "Exploración física");
const TERAPIA = P(EQ, "Terapia y rehabilitación");
const INSTR = P(EQ, "Instrumental y práctica");
const REPUESTOS = P(EQ, "Repuestos y accesorios de equipos");
const IDENT = P(ACC, "Identificación");
const BOLSOS = P(ACC, "Bolsos y morrales");
const PAPEL = P(ACC, "Papelería");
const OTROS = P(ACC, "Otros accesorios");

// ── Atributos ───────────────────────────────────────────────────────────────

const ATTRIBUTES: AttributeDef[] = [
  { code: "genero", name: "Género", isMulti: false, values: ["Dama", "Caballero", "Unisex"] },
  { code: "corte", name: "Corte", isMulti: false, values: ["Recta", "Ancha", "Jogger"] },
  { code: "tela", name: "Tela", isMulti: false, values: ["Stretch", "Mic", "Algodón", "Poliéster"] },
  { code: "largo", name: "Largo", isMulti: false, values: ["Corta", "Larga"] },
  { code: "tematica", name: "Temática", isMulti: false, values: ["Personajes", "Animales", "Especialidad médica", "Liso", "Estampado"] },
  {
    code: "especialidad",
    name: "Especialidad",
    isMulti: true,
    values: [
      "Medicina general", "Enfermería", "Odontología", "Bioanálisis", "Anestesiología",
      "Pediatría", "Cirugía", "Fisioterapia", "Bacteriología",
    ],
  },
  { code: "tipo_tensiometro", name: "Tipo de tensiómetro", isMulti: false, values: ["Digital de brazo", "Digital de muñeca", "Manual", "Doble manguera"] },
  { code: "voz", name: "Voz", isMulti: false, values: ["Con voz", "Sin voz"] },
  { code: "publico", name: "Público", isMulti: false, values: ["Adulto", "Pediátrico"] },
  { code: "tipo_termometro", name: "Tipo de termómetro", isMulti: false, values: ["Digital", "Infrarrojo", "Mercurio"] },
];

// ── Colores ─────────────────────────────────────────────────────────────────

const AZ = "Azules";
const VE = "Verdes";
const RO = "Rojos";
const RS = "Rosados";
const MO = "Morados";
const AM = "Amarillos y naranjas";
const NE = "Neutros";
const ES = "Estampados";

const c = (name: string, hex: string, family: string, aliases: string[] = []): ColorDef => ({
  name,
  hex,
  family,
  aliases,
});

/**
 * Un color canónico por cada color de `wm.colors` y cada texto de `product_variants.color`
 * (unificados con normalizeKey). Los textos que sólo difieren en mayúsculas o acentos
 * coinciden solos; los alias cubren las demás variantes de escritura.
 */
const COLORS: ColorDef[] = [
  // Azules
  c("Azul", "#2563EB", AZ, ["Azules"]),
  c("Azul Celeste", "#7DD3FC", AZ),
  c("Azul Cielo", "#87CEEB", AZ),
  c("Azul Marino", "#1E3A8A", AZ),
  c("Azul Niebla", "#8FA9C8", AZ),
  c("Azul Real Oscuro", "#233A8E", AZ),
  c("Azul Rey", "#1D4ED8", AZ),
  c("Azul Valcri", "#2F5DA8", AZ),
  c("Aguamarina", "#7FD8D3", AZ),
  c("Turquesa", "#40E0D0", AZ),
  c("Océano Profundo", "#0B3C5D", AZ),
  c("Bruma Marina", "#A3C1C9", AZ),
  c("Cristal Marino", "#9DD3D8", AZ),
  c("Caribean", "#14B8A6", AZ),
  c("Caribean Claro", "#5EEAD4", AZ),
  c("Caribean Oscuro", "#0F6B63", AZ),
  // Verdes
  c("Verde", "#22C55E", VE),
  c("Verde Caribean", "#0D9488", VE),
  c("Verde Lima", "#84CC16", VE),
  c("Verde Manzana", "#8DB600", VE),
  c("Verde Pistacho", "#93C572", VE),
  c("Verde Oliva", "#708238", VE, ["Verde Olivo"]),
  c("Verde Oscuro", "#166534", VE),
  c("Verde Quirófano", "#0F766E", VE, ["Verde Qx"]),
  c("Verde Esmeralda", "#059669", VE),
  c("Verde Enfermera", "#2E8B57", VE),
  c("Verde Fluorescente", "#39FF14", VE),
  c("Verde Valcri", "#3CB371", VE),
  c("Amazonas", "#3B7A57", VE),
  c("Menta", "#86EFAC", VE),
  c("Musgo", "#4A5D23", VE),
  c("Apio", "#B5C99A", VE),
  c("Oliva Martini", "#7C7F3A", VE),
  // Rojos
  c("Rojo", "#DC2626", RO),
  c("Vinotinto", "#7F1D1D", RO, ["Vino Tinto"]),
  c("Borgoña", "#800020", RO),
  c("Coral", "#FB7185", RO),
  c("Coral Intenso", "#F43F5E", RO),
  c("Especia de Bayas", "#8E3B46", RO),
  // Rosados
  c("Rosado", "#F9A8D4", RS, ["Rosada", "Rosa"]),
  c("Rosa Palo", "#F4C2C2", RS),
  c("Rosa Vieja", "#C08081", RS),
  c("Rosado Bebé", "#FBCFE8", RS),
  c("Rosado Claro", "#FCE7F3", RS),
  c("Rosado Oscuro", "#BE185D", RS),
  c("Fucsia", "#D946EF", RS),
  c("Magenta", "#DB2777", RS),
  // Morados
  c("Morado", "#7C3AED", MO, ["Morada"]),
  c("Lila", "#A78BFA", MO),
  c("Lila Claro", "#DDD6FE", MO),
  c("Lavanda", "#C4B5FD", MO),
  c("Amatista", "#9966CC", MO),
  c("Malva", "#B784A7", MO),
  // Amarillos y naranjas
  c("Amarillo", "#FACC15", AM, ["Amarilla"]),
  c("Mostaza", "#D4A017", AM),
  c("Naranja", "#F97316", AM),
  c("Melón", "#FDBA74", AM),
  c("Dorado", "#D4AF37", AM),
  c("Terracota", "#C0603F", AM),
  // Neutros
  c("Negro", "#111827", NE, ["Negra"]),
  c("Blanco", "#FFFFFF", NE),
  c("Blanco Óptico", "#F8FAFC", NE),
  c("Gris", "#9CA3AF", NE),
  c("Gris Carbón", "#374151", NE),
  c("Gris Claro", "#D1D5DB", NE),
  c("Gris Plomo", "#6B7280", NE),
  c("Gris Salvia", "#9CAF88", NE),
  c("Beige", "#E8DCC4", NE),
  c("Caqui", "#C3B091", NE),
  c("Marrón", "#7C4A2D", NE),
  c("Espresso", "#4B2E2A", NE),
  c("Pardo Tostado", "#8B6B4A", NE),
  c("Helado de Crema", "#F3E5C8", NE),
  c("Tierra", "#8B5A2B", NE),
  c("Tierra Claro", "#B08560", NE),
  c("Transparente", "#F1F5F9", NE),
  // Estampados
  c("Cuadrada Azul", "#3B82F6", ES),
  c("Cuadrada Verde", "#4ADE80", ES),
  c("Pingüino Lila", "#A78BFA", ES),
  c("Amarillo con Diseño", "#FDE047", ES),
  c("Azul con Blanco", "#60A5FA", ES),
  c("Amarillo con Azul", "#EAB308", ES),
  c("Azul Perro", "#3B5BA5", ES),
  c("Azul Tiger", "#1E40AF", ES),
  c("Tierra - Caribean", "#5F8F7A", ES),
  c("Batido Amarillo", "#FDE68A", ES, ["Batido Amarrillo"]),
  c("Nutrición", "#10B981", ES),
];

// ── Marcas ──────────────────────────────────────────────────────────────────

const BRANDS: BrandDef[] = [
  {
    name: "World Medics",
    aliases: [/\bworld medics\b/],
    lines: ["Mao", "Mao Pro", "Altu", "Esencial", "Básico", "Cargo", "Colors", "Elite", "Pro"],
  },
  { name: "Figs", aliases: [/\bfigs\b/], lines: [] },
  { name: "Littmann", aliases: [/\blittmann\b/], lines: ["Classic III"] },
  { name: "GMD", aliases: [/\bgmd\b/], lines: [] },
  { name: "Valcri", aliases: [/\bvalcri\b/], lines: [] },
  { name: "Dr John", aliases: [/\bdr\.?\s*jo(h)?n\b/], lines: [] },
  { name: "Carditek", aliases: [/\bcarditek\b/], lines: [] },
  { name: "Gorro Med", aliases: [], lines: [] },
  { name: "Toons", aliases: [], lines: [] },
  { name: "Genérico", aliases: [], lines: [] },
  { name: "DM", aliases: [], lines: [] },
];

// ── Mapeo de categorías actuales ────────────────────────────────────────────

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  Uniformes: CONJUNTOS,
  Estampadas: CONJUNTOS,
  "Batas Médicas": BATAS,
  Gorros: GORROS,
  "Gorro Migraña": GORROS,
  "Medias Compresivas": MEDIAS,
  Estetoscopio: ESTETOS,
  "Accesorio Esteto": REPUESTOS,
  "Respuesto Littmann": REPUESTOS,
  Tensiometro: TENSIO,
  Oximetro: OXI,
  Termometro: TERMO,
  Otoscopio: OTO,
  "Video Otoscopio": OTO,
  ORL: OTO,
  "ORL Generico": OTO,
  "Kit De Exploracion": OTO,
  Glucometro: GLUCO,
  Lancetas: GLUCO,
  "Tiras Reactivas": GLUCO,
  "Martillo Reflejo": EXPLO,
  "Martillo Taylor": EXPLO,
  Linternas: EXPLO,
  "Puntador Lasser": EXPLO,
  "Cinta Metrica": EXPLO,
  Goniometro: EXPLO,
  Plicometro: EXPLO,
  Doppler: EXPLO,
  "Plantilas ECG": EXPLO,
  "Plantilla ECG": EXPLO,
  Tens: TERAPIA,
  Nebulizador: TERAPIA,
  "Cinta Kinestesica": TERAPIA,
  "Bandas Elasticas": TERAPIA,
  "Tijeras Trauma": INSTR,
  "Kit De Sutura": INSTR,
  Torniquetes: INSTR,
  "Pad De Practica": INSTR,
  Kit: INSTR,
  "Kit Generico + Pad": INSTR,
  Lanyard: IDENT,
  Portacarnet: IDENT,
  Pines: IDENT,
  Bolso: BOLSOS,
  Morral: BOLSOS,
  Portadocumentos: BOLSOS,
  Libretas: PAPEL,
  Boligrafo: PAPEL,
  Libro: PAPEL,
  "Rompe Ampollas": OTROS,
  Control: OTROS,
  Maxikoala: OTROS,
};

const UNIFORM_OVERRIDES: KeywordRule[] = [
  { pattern: /\b(bata|chaqueta|larga|sobretodo|solapa)\b/, category: BATAS },
  { pattern: /\bbolso\b/, category: BOLSOS },
  { pattern: /modelo anatomico/, category: INSTR },
];

const NAME_CATEGORY_RULES: KeywordRule[] = [
  { pattern: /gorro/, category: GORROS },
  { pattern: /medias compresivas/, category: MEDIAS },
  { pattern: /estetoscopio/, category: ESTETOS },
  { pattern: /tensiometro/, category: TENSIO },
  { pattern: /oximetro/, category: OXI },
  { pattern: /termometro/, category: TERMO },
  { pattern: /otoscopio|fronto luz/, category: OTO },
  { pattern: /glucometro/, category: GLUCO },
  { pattern: /diapason/, category: EXPLO },
  { pattern: /rompe ampolla/, category: OTROS },
  { pattern: /lanyard|portacarnet|\bpines?\b/, category: IDENT },
  { pattern: /sutura|tijera|torniquete|modelo anatomico/, category: INSTR },
  { pattern: /boligrafo|libreta|libro/, category: PAPEL },
  { pattern: /\btens\b/, category: TERAPIA },
  { pattern: /\b(mao|figs|stretch|jogger|recta)\b/, category: CONJUNTOS },
];

const kw = (attribute: string, value: string, pattern: RegExp): AttributeKeyword => ({
  attribute,
  value,
  pattern,
});

const ATTRIBUTE_KEYWORDS: AttributeKeyword[] = [
  kw("genero", "Dama", /\b(dama|mujer)\b/),
  kw("genero", "Caballero", /\b(caballero|hombre)\b/),
  kw("genero", "Unisex", /\bunisex\b/),
  kw("corte", "Recta", /\brecta\b/),
  kw("corte", "Ancha", /\bancha\b/),
  kw("corte", "Jogger", /\bjogger\b/),
  kw("tela", "Stretch", /\bstretch\b/),
  kw("tela", "Mic", /\bmic\b/),
  kw("tela", "Algodón", /\balgodon\b/),
  kw("tela", "Poliéster", /\bpoliester\b/),
  kw("largo", "Larga", /\blarga\b/),
  kw("largo", "Corta", /\bcorta\b/),
  kw("voz", "Con voz", /\bcon voz\b/),
  kw("voz", "Sin voz", /\bsin voz\b/),
  kw("tipo_tensiometro", "Digital de muñeca", /\bmuneca\b/),
  kw("tipo_tensiometro", "Doble manguera", /\bdoble manguera\b/),
  kw("tipo_tensiometro", "Digital de brazo", /\bdigital\b/),
  kw("tipo_termometro", "Mercurio", /\bmercurio\b/),
  kw("tipo_termometro", "Infrarrojo", /\binfrarrojo\b/),
  kw("tipo_termometro", "Digital", /\bdigital\b/),
  kw("publico", "Pediátrico", /\b(pediatric[oa]|baby|bebe)\b/),
  kw("tematica", "Especialidad médica", /\b(anestesi|bioanalis|odontolog|bacteriolog|cerebelo|enfermer|medicin|quirofano|cardio|pediatr|neuro|fisio)/),
  kw("especialidad", "Anestesiología", /anestesi/),
  kw("especialidad", "Bioanálisis", /bioanalis/),
  kw("especialidad", "Odontología", /odontolog/),
  kw("especialidad", "Enfermería", /enfermer/),
  kw("especialidad", "Bacteriología", /bacteriolog/),
  kw("especialidad", "Pediatría", /pediatr/),
  kw("especialidad", "Fisioterapia", /fisio/),
];

export const TAXONOMY: Taxonomy = {
  departments: [UNI, EQ, ACC],
  categories: CATEGORIES,
  attributes: ATTRIBUTES,
  optionValues: {
    talla: ["XXS", "XS", "S", "S-M", "M", "L", "L-XL", "XL", "2XL", "3XL", "Única"],
    amarre: ["Moño", "Tiras", "Elástica"],
  },
  optionAliases: {
    "s/m": "S-M",
    "s m": "S-M",
    "l/xl": "L-XL",
    xxl: "2XL",
    xxxl: "3XL",
    "talla unica": "Única",
    tira: "Tiras",
  },
  colorFamilies: [AZ, VE, RO, RS, MO, AM, NE, ES],
  colors: COLORS,
  brands: BRANDS,
  legacyCategoryMap: LEGACY_CATEGORY_MAP,
  uniformOverrides: UNIFORM_OVERRIDES,
  nameCategoryRules: NAME_CATEGORY_RULES,
  attributeKeywords: ATTRIBUTE_KEYWORDS,
};
