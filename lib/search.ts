const SIZE_ALIASES: Record<string, string[]> = {
  xs: ["extra small", "extrasmall"],
  s: ["small", "chica", "chico"],
  m: ["medium", "mediana", "mediano"],
  l: ["large", "grande"],
  xl: ["extra large", "extralarge"],
  xxl: ["2xl", "extra extra large", "extraextra large"],
  u: ["unica", "unico", "unitalla"],
};

function normalizeSearchValue(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenVariants(token: string): string[] {
  const variants = new Set([token]);

  if (token.endsWith("es") && token.length > 4) {
    variants.add(token.slice(0, -2));
  }
  if (token.endsWith("s") && token.length > 3) {
    variants.add(token.slice(0, -1));
  }
  if (token.endsWith("a") && token.length > 3) {
    variants.add(`${token.slice(0, -1)}o`);
  }
  if (token.endsWith("o") && token.length > 3) {
    variants.add(`${token.slice(0, -1)}a`);
  }

  for (const [size, aliases] of Object.entries(SIZE_ALIASES)) {
    if (token === size || aliases.includes(token)) {
      variants.add(size);
      aliases.forEach((alias) => variants.add(alias));
    }
  }

  return [...variants];
}

export function queryTokens(query: string): string[] {
  return normalizeSearchValue(query).split(/\s+/).filter(Boolean);
}

export function buildSearchIndex(values: unknown[]): {
  haystack: string;
  tokens: Set<string>;
} {
  const normalizedValues = values.flatMap((value) => {
    if (Array.isArray(value)) return value.map(normalizeSearchValue);
    return [normalizeSearchValue(value)];
  });
  const tokens = new Set<string>();

  for (const value of normalizedValues) {
    const compact = value.replace(/\s+/g, "");
    if (compact.length > 1) {
      tokens.add(compact);
    }
    value.split(/\s+/).filter(Boolean).forEach((token) => {
      tokens.add(token);
      tokenVariants(token).forEach((variant) => tokens.add(variant));
    });
  }

  return {
    haystack: ` ${normalizedValues
      .filter(Boolean)
      .flatMap((value) => [value, value.replace(/\s+/g, "")])
      .join(" ")} `,
    tokens,
  };
}

export function matchesProductQuery(values: unknown[], query: string): boolean {
  const tokens = queryTokens(query);
  if (!tokens.length) return true;

  const index = buildSearchIndex(values);
  return tokens.every((token) =>
    tokenVariants(token).some((variant) => {
      if (variant.length <= 1) return index.tokens.has(variant);
      return index.haystack.includes(variant) || index.tokens.has(variant);
    }),
  );
}
