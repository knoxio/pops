/** Shape of pagination metadata returned by list endpoints. */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Build the pagination metadata for a response. */
export function paginationMeta(total: number, limit: number, offset: number): PaginationMeta {
  return { total, limit, offset, hasMore: offset + limit < total };
}
