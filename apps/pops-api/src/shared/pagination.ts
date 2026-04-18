/**
 * Pagination parsing and response building.
 * Shared across all list endpoints.
 */
import { z } from 'zod';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/** Parsed pagination parameters from query string. */
export interface PaginationParams {
  limit: number;
  offset: number;
}

/** Parse limit/offset from Express query params, with sane defaults and bounds. */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const rawLimit = Number(query['limit']);
  const rawOffset = Number(query['offset']);

  return {
    limit: Math.min(
      Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT,
      MAX_LIMIT
    ),
    offset: Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
  };
}

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
export function paginationMeta(
  total: number,
  limit: number,
  offset: number
): { total: number; limit: number; offset: number; hasMore: boolean } {
  return { total, limit, offset, hasMore: offset + limit < total };
}
