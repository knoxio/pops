/**
 * List + hydrate primitives for the engrams data-access layer.
 *
 * Split out from `engrams.ts` to keep each file under the per-file line
 * ceiling.
 */
import { and, count, eq, inArray, like, sql } from 'drizzle-orm';

import { engramIndex, engramLinks, engramScopes, engramTags } from '../schema.js';
import { bucket, indexRowFromDrizzle, projectEngram } from './engrams-helpers.js';

import type { Engram, IndexRow, ListEngramsOptions, ListEngramsResult } from './engrams-types.js';
import type { CerebrumDb } from './internal.js';

function buildConditions(
  db: CerebrumDb,
  opts: ListEngramsOptions
): ReturnType<typeof and> | undefined {
  const conditions = [];
  if (opts.type) conditions.push(eq(engramIndex.type, opts.type));
  if (opts.status) conditions.push(eq(engramIndex.status, opts.status));
  if (opts.search) conditions.push(like(engramIndex.title, `%${opts.search}%`));
  if (opts.scopes && opts.scopes.length > 0) {
    conditions.push(
      inArray(
        engramIndex.id,
        db
          .select({ engramId: engramScopes.engramId })
          .from(engramScopes)
          .where(inArray(engramScopes.scope, opts.scopes))
      )
    );
  }
  if (opts.tags && opts.tags.length > 0) {
    conditions.push(
      inArray(
        engramIndex.id,
        db
          .select({ engramId: engramTags.engramId })
          .from(engramTags)
          .where(inArray(engramTags.tag, opts.tags))
      )
    );
  }
  if (opts.ids && opts.ids.length > 0) {
    conditions.push(inArray(engramIndex.id, opts.ids));
  }
  return conditions.length === 0 ? undefined : and(...conditions);
}

function resolveOrderColumn(
  field: NonNullable<ListEngramsOptions['sort']>['field']
): typeof engramIndex.title | typeof engramIndex.createdAt | typeof engramIndex.modifiedAt {
  if (field === 'title') return engramIndex.title;
  if (field === 'created_at') return engramIndex.createdAt;
  return engramIndex.modifiedAt;
}

function resolveLimit(opts: ListEngramsOptions): number {
  if (opts.ids && opts.limit === undefined) return opts.ids.length;
  return opts.limit ?? 50;
}

export function listEngrams(db: CerebrumDb, opts: ListEngramsOptions = {}): ListEngramsResult {
  const where = buildConditions(db, opts);
  const sortField = opts.sort?.field ?? 'modified_at';
  const sortDir = opts.sort?.direction ?? 'desc';
  const orderColumn = resolveOrderColumn(sortField);
  const limit = resolveLimit(opts);
  const offset = opts.offset ?? 0;

  const rowsQuery = db.select().from(engramIndex).$dynamic();
  const rows = (where ? rowsQuery.where(where) : rowsQuery)
    .orderBy(sortDir === 'asc' ? orderColumn : sql`${orderColumn} desc`)
    .limit(limit)
    .offset(offset)
    .all();

  const totalQuery = db.select({ total: count() }).from(engramIndex).$dynamic();
  const [totalRow] = (where ? totalQuery.where(where) : totalQuery).all();

  return {
    engrams: hydrateEngrams(db, rows.map(indexRowFromDrizzle)),
    total: totalRow?.total ?? 0,
  };
}

export function hydrateEngrams(db: CerebrumDb, rows: IndexRow[]): Engram[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const scopesByEngram = bucket(
    db
      .select({ engramId: engramScopes.engramId, value: engramScopes.scope })
      .from(engramScopes)
      .where(inArray(engramScopes.engramId, ids))
      .all()
  );
  const tagsByEngram = bucket(
    db
      .select({ engramId: engramTags.engramId, value: engramTags.tag })
      .from(engramTags)
      .where(inArray(engramTags.engramId, ids))
      .all()
  );
  const linksByEngram = bucket(
    db
      .select({ engramId: engramLinks.sourceId, value: engramLinks.targetId })
      .from(engramLinks)
      .where(inArray(engramLinks.sourceId, ids))
      .all()
  );

  return rows.map((row) =>
    projectEngram(
      row,
      scopesByEngram.get(row.id) ?? [],
      tagsByEngram.get(row.id) ?? [],
      linksByEngram.get(row.id) ?? []
    )
  );
}
