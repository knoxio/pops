/**
 * `shelfImpressions.*` sub-router — discover-shelf impression tracking.
 *
 * `freshness` 404s when the shelf has zero impressions in the window (callers
 * wanting the freshness floor use the default instead).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES } from './rest-schemas.js';

const c = initContract();

const ShelfIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9:_\-./]+$/);

const DaysQuery = z.coerce.number().int().positive().max(90).default(7);

export const mediaShelfImpressionsContract = c.router({
  record: {
    method: 'POST',
    path: '/shelf-impressions',
    body: z.object({ shelfIds: z.array(ShelfIdSchema).min(1).max(50) }),
    responses: { 200: z.object({ ok: z.literal(true), recorded: z.number().int().nonnegative() }) },
    summary: 'Record impressions for one or more shelves',
  },
  recent: {
    method: 'GET',
    path: '/shelf-impressions/recent',
    query: z.object({ days: DaysQuery }),
    responses: {
      200: z.object({
        windowDays: z.number().int().positive(),
        entries: z.array(
          z.object({ shelfId: z.string(), impressionCount: z.number().int().nonnegative() })
        ),
      }),
    },
    summary: 'List per-shelf impression counts within the recent window',
  },
  freshness: {
    method: 'GET',
    path: '/shelf-impressions/freshness',
    query: z.object({ shelfId: ShelfIdSchema, days: DaysQuery }),
    responses: {
      200: z.object({
        shelfId: z.string(),
        impressionCount: z.number().int().nonnegative(),
        freshness: z.number().min(0).max(1),
      }),
      ...ERR_RESPONSES,
    },
    summary: 'Get the impression count + freshness multiplier for a shelf',
  },
  cleanup: {
    method: 'POST',
    path: '/shelf-impressions/cleanup',
    body: z.object({}).optional(),
    responses: { 200: z.object({ ok: z.literal(true) }) },
    summary: 'Run the impressions retention cleanup (idempotent)',
  },
});
