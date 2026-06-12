/**
 * Pagination response builder.
 *
 * Mirrors `apps/pops-api/src/shared/pagination.ts` (export-surface only).
 * Duplicated locally so inventory-api stands alone of pops-api in the
 * dependency graph per the Phase 5 writer-move pattern.
 */
import { z } from 'zod';

/** Shape of pagination metadata returned by list endpoints. */
export type PaginationMeta = { total: number; limit: number; offset: number; hasMore: boolean };

/** Zod schema for the pagination metadata response shape. */
export const PaginationMetaSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});

/** Build the pagination metadata for a response. */
export function paginationMeta(total: number, limit: number, offset: number): PaginationMeta {
  return { total, limit, offset, hasMore: offset + limit < total };
}
