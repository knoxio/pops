/**
 * Handler for the `entityUsage.*` sub-router — contacts enriched with their
 * per-entity `transactionCount`, joined in memory against finance transactions
 * (PRD-163 US-06). The contact attributes arrive from the live
 * `pillar('contacts').entities.list` fetch already in wire shape (aliases /
 * defaultTags as arrays), so the handler only attaches the count and shape.
 */
import { type EntityUsageRow, type FinanceDb, listEntityUsage } from '../../db/index.js';
import { type ContactsClient } from '../contacts/client.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeEntityUsageContract } from '../../contract/rest-entity-usage.js';

type Req = ServerInferRequest<typeof financeEntityUsageContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function toEntityUsage(row: EntityUsageRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    abn: row.abn,
    aliases: row.aliases,
    defaultTransactionType: row.defaultTransactionType,
    defaultTags: row.defaultTags,
    notes: row.notes,
    lastEditedTime: row.lastEditedTime,
    transactionCount: row.transactionCount,
  };
}

export function makeEntityUsageHandlers(db: FinanceDb, contacts: ContactsClient) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(async () => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = await listEntityUsage(db, contacts, {
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
