export interface PaginatedResult<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
}

export function normalizeSearch(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("ar-EG").replace(/\s+/g, " ");
}

export function filterAndPaginate<T>(
  items: readonly T[],
  query: string,
  matcher: (item: T, normalizedQuery: string) => boolean,
  page: number,
  pageSize = 30,
): PaginatedResult<T> {
  const normalizedQuery = normalizeSearch(query);
  const filtered = normalizedQuery ? items.filter((item) => matcher(item, normalizedQuery)) : [...items];
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    totalItems: filtered.length,
    totalPages,
    currentPage,
  };
}
