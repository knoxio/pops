/**
 * Pagination response builder.
 *
 * Mirrors `apps/pops-api/src/shared/pagination.ts` (export-surface only —
 * media-api's tRPC routers don't need the Express `parsePagination` helper).
 * Duplicated locally so media-api stands alone of pops-api in the dependency
 * graph per the Phase 5 writer-move pattern.
 */
import { z } from 'zod';

export type PaginationMeta = { total: number; limit: number; offset: number; hasMore: boolean };

export const PaginationMetaSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});

export function paginationMeta(total: number, limit: number, offset: number): PaginationMeta {
  return { total, limit, offset, hasMore: offset + limit < total };
}
