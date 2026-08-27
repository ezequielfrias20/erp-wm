import { measure } from "@/lib/performance";

const SUPABASE_PAGE_SIZE = 1000;
const PAGE_CONCURRENCY = 2;

type SupabasePage<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<SupabasePage<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let batchStart = 0; ; batchStart += SUPABASE_PAGE_SIZE * PAGE_CONCURRENCY) {
    const pages = await Promise.all(
      Array.from({ length: PAGE_CONCURRENCY }, (_, index) => {
        const from = batchStart + index * SUPABASE_PAGE_SIZE;
        const to = from + SUPABASE_PAGE_SIZE - 1;
        return measure(
          `supabase.page.${from}-${to}`,
          () => Promise.resolve(buildQuery(from, to)),
        );
      }),
    );

    let reachedEnd = false;
    for (const { data, error } of pages) {
      if (error) throw new Error(error.message);
      const chunk = data ?? [];
      rows.push(...chunk);
      if (chunk.length < SUPABASE_PAGE_SIZE) {
        reachedEnd = true;
        break;
      }
    }
    if (reachedEnd) break;
  }

  return rows;
}
