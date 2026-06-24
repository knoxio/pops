/**
 * Pagination metadata for the registry pillar's list endpoints.
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
