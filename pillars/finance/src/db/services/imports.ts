/**
 * Persistence helpers for the finance imports slice.
 *
 * This module holds only the pure-persistence primitives the import pipeline
 * uses against `transactions`:
 *
 *   - `findExistingChecksums` — checksum dedup probe (read-only)
 *   - `buildEntityMaps`       — name + alias lookup builder over a fetched set
 *   - `insertImportTransaction` — low-level transactions insert (write)
 *
 * The imports slice owns NO tables of its own. Entities are not mirrored in
 * finance: the matcher fetches the contact set from the contacts pillar per
 * import run and `buildEntityMaps` turns that fetched set into the
 * lookup/alias maps in memory.
 *
 * Follows the standard service pattern: db-arg services, plain functions,
 * typed domain errors, no HTTP concerns.
 */
import { eq, inArray } from 'drizzle-orm';

import { ImportTransactionPersistError } from '../errors.js';
import { transactions } from '../schema.js';

import type { ContactEntity } from '../../api/contacts/client.js';
import type { FinanceDb } from './internal.js';

/** Single entry in the entity name lookup map. */
export interface EntityLookupEntry {
  id: string;
  /** Original-case entity name as stored in the contacts pillar. */
  name: string;
}

/** Two pre-built maps consumed by the import matching stages. */
export interface EntityMaps {
  /** Lowercase entity name → `{ id, name (original case) }`. */
  entityLookup: Map<string, EntityLookupEntry>;
  /** Lowercase alias → entity name (original case). */
  aliasMap: Map<string, string>;
}

/** Mutable subset accepted on `insertImportTransaction`. */
export interface InsertImportTransactionInput {
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  rawRow?: string;
  checksum?: string;
}

/** Raw drizzle row shape returned by `insertImportTransaction`. */
export type ImportTransactionRow = typeof transactions.$inferSelect;

const CHECKSUM_BATCH_SIZE = 500;

/**
 * Return the subset of `checksums` that already exist in the
 * `transactions` table. Empty input returns an empty set without
 * issuing a query.
 *
 * Batched at 500 per IN-list to stay under SQLite's `SQLITE_MAX_VARIABLE_NUMBER`
 * limit (default 999).
 */
export function findExistingChecksums(db: FinanceDb, checksums: string[]): Set<string> {
  if (checksums.length === 0) return new Set();

  const existing = new Set<string>();
  for (let i = 0; i < checksums.length; i += CHECKSUM_BATCH_SIZE) {
    const batch = checksums.slice(i, i + CHECKSUM_BATCH_SIZE);
    const rows = db
      .select({ checksum: transactions.checksum })
      .from(transactions)
      .where(inArray(transactions.checksum, batch))
      .all();
    for (const row of rows) {
      if (row.checksum) existing.add(row.checksum);
    }
  }

  return existing;
}

/**
 * Build the entity lookup + alias maps consumed by the import matching
 * stages from a contact set fetched live from the contacts pillar. Pure —
 * no DB access; the caller fetches the set once per import run and feeds it
 * here, so the maps reflect the live contacts data with no persistent mirror.
 *
 * - Lookup keys are lowercased for O(1) case-insensitive lookups.
 * - Values preserve the original-case name for display.
 * - Aliases arrive already split into arrays from the contacts wire shape;
 *   whitespace-only aliases are dropped.
 */
export function buildEntityMaps(contacts: ContactEntity[]): EntityMaps {
  const entityLookup = new Map<string, EntityLookupEntry>();
  const aliasMap = new Map<string, string>();

  for (const contact of contacts) {
    entityLookup.set(contact.name.toLowerCase(), { id: contact.id, name: contact.name });
    for (const raw of contact.aliases) {
      const alias = raw.trim();
      if (alias.length === 0) continue;
      aliasMap.set(alias.toLowerCase(), contact.name);
    }
  }

  return { entityLookup, aliasMap };
}

/**
 * Build the `entityId → defaultTags` map the tag-suggester's entity-default
 * stage consumes, from the same fetched contact set. Pure — one in-memory map
 * per import run, no per-transaction DB read.
 */
export function buildDefaultTagsByEntity(contacts: ContactEntity[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const contact of contacts) {
    if (contact.defaultTags.length > 0) map.set(contact.id, contact.defaultTags);
  }
  return map;
}

/**
 * Insert a single transaction during the commit phase of an import.
 *
 * The full atomic commit pipeline (changeset application, tag-rule changesets,
 * reclassification of existing transactions) is cross-slice orchestration that
 * lives above the persistence layer; this primitive only writes the row.
 *
 * Throws `ImportTransactionPersistError` if the row is not readable after the
 * insert — a defensive check against silent SQLite write failures.
 */
export function insertImportTransaction(
  db: FinanceDb,
  input: InsertImportTransactionInput
): ImportTransactionRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(transactions)
    .values({
      id,
      description: input.description,
      account: input.account,
      amount: input.amount,
      date: input.date,
      type: input.type || '',
      tags: JSON.stringify(input.tags),
      entityId: input.entityId,
      entityName: input.entityName,
      location: input.location,
      checksum: input.checksum ?? null,
      rawRow: input.rawRow ?? null,
      lastEditedTime: now,
    })
    .run();

  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) throw new ImportTransactionPersistError(id);
  return row;
}
