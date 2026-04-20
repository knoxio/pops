import { eq } from 'drizzle-orm';

import {
  engramIndex,
  engramScopes,
  homeInventory,
  movies,
  transactions,
  tvShows,
} from '@pops/db-types';

import {
  crossSourceTitle,
  isSecretScope,
  type ResolvedMetadata,
} from './semantic-search-helpers.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { RetrievalFilters } from './types.js';

function fetchDomainRow(
  db: BetterSQLite3Database,
  sourceType: string,
  sourceId: string
): Record<string, unknown> | null {
  switch (sourceType) {
    case 'transaction': {
      const rows = db.select().from(transactions).where(eq(transactions.id, sourceId)).all();
      return (rows[0] as Record<string, unknown> | undefined) ?? null;
    }
    case 'movie': {
      const rows = db
        .select()
        .from(movies)
        .where(eq(movies.id, Number(sourceId)))
        .all();
      return (rows[0] as Record<string, unknown> | undefined) ?? null;
    }
    case 'tv_show': {
      const rows = db
        .select()
        .from(tvShows)
        .where(eq(tvShows.id, Number(sourceId)))
        .all();
      return (rows[0] as Record<string, unknown> | undefined) ?? null;
    }
    case 'inventory': {
      const rows = db.select().from(homeInventory).where(eq(homeInventory.id, sourceId)).all();
      return (rows[0] as Record<string, unknown> | undefined) ?? null;
    }
    default:
      return null;
  }
}

interface EngramRow {
  type: string;
  source: string;
  status: string;
  title: string;
  createdAt: string;
  modifiedAt: string;
  wordCount: number;
}

function matchesScopes(scopes: string[], scopeFilters: string[]): boolean {
  return scopes.some((s) => scopeFilters.some((f) => s === f || s.startsWith(f + '.')));
}

function passesArrayFilter(value: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(value);
}

function passesEngramFilters(row: EngramRow, scopes: string[], filters: RetrievalFilters): boolean {
  if (row.status === 'orphaned') return false;
  if (!passesArrayFilter(row.type, filters.types)) return false;
  if (!passesArrayFilter(row.status, filters.status)) return false;
  if (!filters.includeSecret && scopes.some(isSecretScope)) return false;
  if (filters.scopes?.length && !matchesScopes(scopes, filters.scopes)) return false;
  return true;
}

function resolveEngramMetadata(
  db: BetterSQLite3Database,
  sourceId: string,
  filters: RetrievalFilters
): ResolvedMetadata | null {
  const rows = db.select().from(engramIndex).where(eq(engramIndex.id, sourceId)).all();
  const row = rows[0];
  if (!row) return null;

  const scopes = db
    .select({ scope: engramScopes.scope })
    .from(engramScopes)
    .where(eq(engramScopes.engramId, sourceId))
    .all()
    .map((s) => s.scope);

  if (!passesEngramFilters(row, scopes, filters)) return null;

  return {
    title: row.title,
    fields: {
      type: row.type,
      source: row.source,
      status: row.status,
      scopes,
      createdAt: row.createdAt,
      modifiedAt: row.modifiedAt,
      wordCount: row.wordCount,
    },
  };
}

export async function resolveMetadata(
  db: BetterSQLite3Database,
  sourceType: string,
  sourceId: string,
  filters: RetrievalFilters
): Promise<ResolvedMetadata | null> {
  if (sourceType === 'engram') {
    return resolveEngramMetadata(db, sourceId, filters);
  }
  const domainRow = fetchDomainRow(db, sourceType, sourceId);
  if (!domainRow) return null;
  return { title: crossSourceTitle(sourceType, domainRow), fields: domainRow };
}
