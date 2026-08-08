const SUPABASE_PAGE_SIZE = 1000;

type SupabasePage<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<SupabasePage<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(error.message);

    const chunk = data ?? [];
    rows.push(...chunk);

    if (chunk.length < SUPABASE_PAGE_SIZE) break;
  }

  return rows;
}
