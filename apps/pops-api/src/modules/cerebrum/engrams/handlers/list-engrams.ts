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

export function listEngrams(
  db: BetterSQLite3Database,
  opts: ListEngramsOptions = {}
): ListEngramsResult {
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

  const where = conditions.length === 0 ? undefined : and(...conditions);
  const sortField = opts.sort?.field ?? 'modified_at';
  const sortDir = opts.sort?.direction ?? 'desc';
  const orderColumn = (() => {
    if (sortField === 'title') return engramIndex.title;
    if (sortField === 'created_at') return engramIndex.createdAt;
    return engramIndex.modifiedAt;
  })();

  const limit = opts.ids && opts.limit === undefined ? opts.ids.length : (opts.limit ?? 50);
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
