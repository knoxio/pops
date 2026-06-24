/**
 * Entity-usage rollup — contacts enriched with their per-entity
 * `transactionCount`, computed by joining the live contact set against finance
 * `transactions.entityId` IN MEMORY.
 *
 * Entities are owned by the contacts pillar; finance keeps no mirror table.
 * The rollup is finance-served because only finance can count
 * `finance.transactions` per entity — but the entity attributes (name, type,
 * abn, aliases, …) come from a per-request `pillar('contacts').entities.list`
 * fetch, NOT a local join. The fetched set is held only for the request.
 *
 * Contacts-down degrades gracefully: the injected client returns an empty set,
 * so the list renders empty rather than throwing.
 */
import { isNotNull, sql } from 'drizzle-orm';

import { transactions } from '../schema.js';
import { type FinanceDb } from './internal.js';

import type { ContactEntity, ContactsClient } from '../../api/contacts/client.js';

export type EntityUsageRow = ContactEntity & { transactionCount: number };

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

/**
 * Count finance transactions per `entityId` in a single grouped query.
 * Returns a map keyed by entity id; entities absent from the map have zero
 * transactions (orphans).
 */
function transactionCountsByEntity(db: FinanceDb): Map<string, number> {
  const rows = db
    .select({
      entityId: transactions.entityId,
      count: sql<number>`CAST(COUNT(${transactions.id}) AS INTEGER)`,
    })
    .from(transactions)
    .where(isNotNull(transactions.entityId))
    .groupBy(transactions.entityId)
    .all();

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.entityId !== null) counts.set(row.entityId, row.count);
  }
  return counts;
}

function compareByNameNoCase(a: EntityUsageRow, b: EntityUsageRow): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

/**
 * List contacts with their per-entity `transactionCount`, joining the live
 * contact set against finance transactions in memory. The `search`/`type`
 * filters are applied by the contacts `entities.list` fetch; `orphanedOnly`
 * and the COLLATE-NOCASE order + pagination are applied here over the joined
 * rows so the wire shape is byte-identical to the former SQL rollup.
 */
export async function listEntityUsage(
  db: FinanceDb,
  contacts: ContactsClient,
  opts: ListEntityUsageOptions
): Promise<EntityUsageListResult> {
  const fetched = await contacts.fetchAllEntities({ search: opts.search, type: opts.type });
  const counts = transactionCountsByEntity(db);

  let joined: EntityUsageRow[] = fetched.map((entity) => ({
    ...entity,
    transactionCount: counts.get(entity.id) ?? 0,
  }));

  if (opts.orphanedOnly) {
    joined = joined.filter((row) => row.transactionCount === 0);
  }
  joined.sort(compareByNameNoCase);

  const total = joined.length;
  const rows = joined.slice(opts.offset, opts.offset + opts.limit);
  return { rows, total };
}
