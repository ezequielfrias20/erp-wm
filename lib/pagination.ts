export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type PageRequest = {
  page: number;
  pageSize: number;
  query: string;
};

export type PageResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePageRequest(params: {
  page?: string;
  pageSize?: string;
  q?: string;
}): PageRequest {
  const requestedSize = positiveInteger(params.pageSize, DEFAULT_PAGE_SIZE);
  return {
    page: positiveInteger(params.page, 1),
    pageSize: PAGE_SIZE_OPTIONS.includes(requestedSize as never)
      ? requestedSize
      : DEFAULT_PAGE_SIZE,
    query: String(params.q ?? "").trim().slice(0, 120),
  };
}

export function pageRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}
