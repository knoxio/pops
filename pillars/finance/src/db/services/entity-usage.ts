/**
 * Entity-usage rollup — entities enriched with their per-entity
 * `transactionCount` via a LEFT JOIN onto finance `transactions`.
 *
 * The `entities` table is core-owned (re-exported from `@pops/shared-schema`),
 * but this join is finance-domain: only the finance pillar can count
 * `finance.transactions` per entity. Ported from the monolith
 * `core/entities/service.ts` `fetchEntitiesPage`/`countEntities`, rewritten to
 * take a `FinanceDb` handle (core's REST `entities` contract deliberately omits
 * `transactionCount`).
 */
import { and, count, eq, like, sql, type SQL } from 'drizzle-orm';

import { entities, transactions } from '../schema.js';
import { type FinanceDb } from './internal.js';

export type EntityUsageRow = typeof entities.$inferSelect & { transactionCount: number };

export interface ListEntityUsageOptions {
  search?: string;
  type?: string;
  orphanedOnly?: boolean;
  limit: number;
  offset: number;
}

export interface EntityUsageListResult {
  rows: EntityUsageRow[];
  total: number;
}

function buildEntityFilter(opts: ListEntityUsageOptions): SQL | undefined {
  const conditions: SQL[] = [];
  if (opts.search) conditions.push(like(entities.name, `%${opts.search}%`));
  if (opts.type) conditions.push(eq(entities.type, opts.type));
  if (conditions.length === 0) return undefined;
  return and(...conditions);
}

function fetchEntitiesPage(
  db: FinanceDb,
  where: SQL | undefined,
  opts: ListEntityUsageOptions
): EntityUsageRow[] {
  let query = db
    .select({
      id: entities.id,
      notionId: entities.notionId,
      name: entities.name,
      type: entities.type,
      abn: entities.abn,
      aliases: entities.aliases,
      defaultTransactionType: entities.defaultTransactionType,
      defaultTags: entities.defaultTags,
      notes: entities.notes,
      lastEditedTime: entities.lastEditedTime,
      ownerUri: entities.ownerUri,
      ownerUriStaleAt: entities.ownerUriStaleAt,
      transactionCount: sql<number>`CAST(COUNT(${transactions.id}) AS INTEGER)`,
    })
    .from(entities)
    .leftJoin(transactions, eq(entities.id, transactions.entityId))
    .where(where)
    .groupBy(entities.id)
    .orderBy(sql`${entities.name} COLLATE NOCASE`)
    .$dynamic();

  if (opts.orphanedOnly) query = query.having(sql`COUNT(${transactions.id}) = 0`);
  return query.limit(opts.limit).offset(opts.offset).all();
}

function countEntities(db: FinanceDb, where: SQL | undefined, orphanedOnly?: boolean): number {
  if (orphanedOnly) {
    return db
      .select({ id: entities.id })
      .from(entities)
      .leftJoin(transactions, eq(entities.id, transactions.entityId))
      .where(where)
      .groupBy(entities.id)
      .having(sql`COUNT(${transactions.id}) = 0`)
      .all().length;
  }
  let countQuery = db.select({ total: count() }).from(entities).$dynamic();
  if (where) countQuery = countQuery.where(where);
  return countQuery.all()[0]?.total ?? 0;
}

/** List entities with optional search / type / orphaned filters, including `transactionCount`. */
export function listEntityUsage(
  db: FinanceDb,
  opts: ListEntityUsageOptions
): EntityUsageListResult {
  const where = buildEntityFilter(opts);
  return {
    rows: fetchEntitiesPage(db, where, opts),
    total: countEntities(db, where, opts.orphanedOnly),
  };
}
