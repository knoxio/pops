/**
 * Filtered, paginated read over `ha_entities` (PRD-229 US-03).
 *
 * Pagination uses an opaque `after` token over the primary key
 * (`entity_id`) so concurrent upserts cannot shift the page boundary —
 * the bridge's source of truth is upstream and there is no stable
 * `created_at` ordering to lean on.
 */
import { and, asc, eq, gt, type SQL } from 'drizzle-orm';

import { haEntities, type HaEntityRow } from '../schema.js';

import type { HaBridgeDb } from './internal.js';

export interface ListEntitiesOptions {
  domain?: string;
  area?: string;
  limit: number;
  after?: string;
}

export interface ListEntitiesResult {
  entities: HaEntityRow[];
  hasMore: boolean;
}

export function listEntities(db: HaBridgeDb, options: ListEntitiesOptions): ListEntitiesResult {
  const conditions: SQL[] = [];
  if (options.domain !== undefined) conditions.push(eq(haEntities.domain, options.domain));
  if (options.area !== undefined) conditions.push(eq(haEntities.area, options.area));
  if (options.after !== undefined) conditions.push(gt(haEntities.entityId, options.after));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(haEntities)
    .where(where)
    .orderBy(asc(haEntities.entityId))
    .limit(options.limit + 1)
    .all();

  const hasMore = rows.length > options.limit;
  const entities = hasMore ? rows.slice(0, options.limit) : rows;
  return { entities, hasMore };
}
