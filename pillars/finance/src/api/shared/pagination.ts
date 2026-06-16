/**
 * Pagination response builder.
 *
 * Duplicated locally (export-surface only — finance-api's REST handlers
 * don't need the Express `parsePagination` helper) so the pillar stands
 * alone of pops-api in the dependency graph.
 */

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
