import { and, count, eq, inArray, like, sql } from 'drizzle-orm';

import { engramIndex, engramLinks, engramScopes, engramTags } from '@pops/db-types';

import { bucket, indexRowFromDrizzle, parseCustomFields, type IndexRow } from './fs-helpers.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { EngramSource, EngramStatus } from '../schema.js';
import type { Engram } from '../types.js';

export interface ListEngramsOptions {
  type?: string;
  scopes?: string[];
  tags?: string[];
  ids?: string[];
  status?: EngramStatus;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: {
    field: 'created_at' | 'modified_at' | 'title';
    direction: 'asc' | 'desc';
  };
}

export interface ListEngramsResult {
  engrams: Engram[];
  total: number;
}

function buildConditions(
  db: BetterSQLite3Database,
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

interface QueryParams {
  where: ReturnType<typeof and> | undefined;
  orderColumn: ReturnType<typeof resolveOrderColumn>;
  sortDir: 'asc' | 'desc';
  limit: number;
  offset: number;
}

function fetchRows(db: BetterSQLite3Database, p: QueryParams): { rows: unknown[]; total: number } {
  const rowsQuery = db.select().from(engramIndex).$dynamic();
  const rows = (p.where ? rowsQuery.where(p.where) : rowsQuery)
    .orderBy(p.sortDir === 'asc' ? p.orderColumn : sql`${p.orderColumn} desc`)
    .limit(p.limit)
    .offset(p.offset)
    .all();

  const totalQuery = db.select({ total: count() }).from(engramIndex).$dynamic();
  const [totalRow] = (p.where ? totalQuery.where(p.where) : totalQuery).all();

  return { rows, total: totalRow?.total ?? 0 };
}

function resolveLimit(opts: ListEngramsOptions): number {
  if (opts.ids && opts.limit === undefined) return opts.ids.length;
  return opts.limit ?? 50;
}

export function listEngrams(
  db: BetterSQLite3Database,
  opts: ListEngramsOptions = {}
): ListEngramsResult {
  const where = buildConditions(db, opts);
  const sortField = opts.sort?.field ?? 'modified_at';
  const sortDir = opts.sort?.direction ?? 'desc';

  const { rows, total } = fetchRows(db, {
    where,
    orderColumn: resolveOrderColumn(sortField),
    sortDir,
    limit: resolveLimit(opts),
    offset: opts.offset ?? 0,
  });

  return {
    engrams: hydrateEngrams(
      db,
      (rows as Parameters<typeof indexRowFromDrizzle>[0][]).map(indexRowFromDrizzle)
    ),
    total,
  };
}

export function hydrateEngrams(db: BetterSQLite3Database, rows: IndexRow[]): Engram[] {
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

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    scopes: scopesByEngram.get(row.id) ?? [],
    tags: tagsByEngram.get(row.id) ?? [],
    links: linksByEngram.get(row.id) ?? [],
    created: row.created_at,
    modified: row.modified_at,
    source: row.source as EngramSource,
    status: row.status as EngramStatus,
    template: row.template,
    title: row.title,
    filePath: row.file_path,
    contentHash: row.content_hash,
    wordCount: row.word_count,
    customFields: parseCustomFields(row.custom_fields),
  }));
}
