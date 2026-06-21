/**
 * `entityUsage.*` sub-router — entities enriched with their per-entity
 * `transactionCount` (+ an orphaned filter).
 *
 * The `entities` table is core-owned, but this rollup joins finance
 * `transactions`, so it is finance-served: core's REST `entities` contract
 * deliberately omits `transactionCount`. Mirrors the monolith
 * `core.entities.list` response shape (entity projection + `transactionCount`)
 * so the entity-management FE is a transport swap.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ENTITY_TYPES } from '../db/index.js';
import { ERR_RESPONSES, LimitQuery, OffsetQuery, PaginationMetaSchema } from './rest-schemas.js';

const c = initContract();

/** Entity projection (mirrors core's `EntitySchema`) plus the finance-owned count. */
export const EntityUsageSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  abn: z.string().nullable(),
  aliases: z.array(z.string()),
  defaultTransactionType: z.string().nullable(),
  defaultTags: z.array(z.string()),
  notes: z.string().nullable(),
  lastEditedTime: z.string(),
  transactionCount: z.number(),
});

const EntityUsageQuery = z.object({
  search: z.string().optional(),
  type: z.enum(ENTITY_TYPES).optional(),
  // Query params arrive as strings; the handler coerces "true" → boolean. A
  // transform here would break OpenAPI JSON-Schema generation.
  orphanedOnly: z.enum(['true', 'false']).optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
});

export const financeEntityUsageContract = c.router({
  list: {
    method: 'GET',
    path: '/entity-usage',
    query: EntityUsageQuery,
    responses: {
      200: z.object({ data: z.array(EntityUsageSchema), pagination: PaginationMetaSchema }),
      ...ERR_RESPONSES,
    },
    summary: 'List entities with per-entity transactionCount; orphanedOnly=true returns count===0',
  },
});
