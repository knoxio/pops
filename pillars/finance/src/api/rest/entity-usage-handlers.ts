/**
 * Handler for the `entityUsage.*` sub-router — the entities + `transactionCount`
 * rollup over the finance-owned join. Projects the shared-schema entity row to
 * core's `EntitySchema` shape (aliases comma-split, defaultTags JSON-parsed),
 * plus the joined `transactionCount`.
 */
import { type EntityUsageRow, type FinanceDb, listEntityUsage } from '../../db/index.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeEntityUsageContract } from '../../contract/rest-entity-usage.js';

type Req = ServerInferRequest<typeof financeEntityUsageContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function parseAliases(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseDefaultTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function toEntityUsage(row: EntityUsageRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    abn: row.abn,
    aliases: parseAliases(row.aliases),
    defaultTransactionType: row.defaultTransactionType,
    defaultTags: parseDefaultTags(row.defaultTags),
    notes: row.notes,
    lastEditedTime: row.lastEditedTime,
    transactionCount: row.transactionCount,
  };
}

export function makeEntityUsageHandlers(db: FinanceDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = listEntityUsage(db, {
          search: query.search,
          type: query.type,
          orphanedOnly: query.orphanedOnly === 'true',
          limit,
          offset,
        });
        return {
          status: 200 as const,
          body: { data: rows.map(toEntityUsage), pagination: paginationMeta(total, limit, offset) },
        };
      }),
  };
}
