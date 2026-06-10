/**
 * Persistence helpers for the finance imports slice.
 *
 * The in-tree pipeline in `apps/pops-api/src/modules/finance/imports/` is
 * a large orchestration surface — CSV/PDF transformers, AI categorisation,
 * progress streaming, transfer classification, retroactive reclassification.
 * Most of that is coordination logic, not data layer.
 *
 * This module scaffolds only the pure-persistence primitives the pipeline
 * uses against `transactions` and `entities`:
 *
 *   - `findExistingChecksums` — checksum dedup probe (read-only)
 *   - `loadEntityMaps`        — name + alias lookup loader (read-only)
 *   - `createImportEntity`    — minimal entity insert (write)
 *   - `insertImportTransaction` — low-level transactions insert (write)
 *
 * Crucially, the imports slice owns NO tables of its own — every write
 * lands in sibling-slice tables (`transactions` → N2, `entities` → core).
 * The migration journal split (PR 2) is therefore a no-op for this slice;
 * PRs 2-4 of N6 only re-route consumers and delete the in-tree shim.
 *
 * Mirrors the wish-list / budgets / tag-vocabulary pattern: db-arg
 * services, plain functions, typed domain errors, no HTTP concerns.
 */
import { eq, inArray, isNotNull } from 'drizzle-orm';

import { ImportTransactionPersistError } from '../errors.js';
import { entities, transactions } from '../schema.js';

import type { FinanceDb } from './internal.js';

/** Single entry in the entity name lookup map. */
export interface EntityLookupEntry {
  id: string;
  /** Original-case entity name as stored in the database. */
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

/** Result of a successful `createImportEntity`. */
export interface CreateImportEntityResult {
  entityId: string;
  entityName: string;
}

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
 * stages. Two-pass: one query for the full lookup, a second narrower query
 * for the alias map.
 *
 * - Lookup keys are lowercased for O(1) case-insensitive lookups.
 * - Values preserve the original-case name for display.
 * - Aliases are parsed from comma-separated strings; whitespace-only
 *   aliases are dropped.
 */
export function loadEntityMaps(db: FinanceDb): EntityMaps {
  const entityLookup = new Map<string, EntityLookupEntry>();
  const aliasMap = new Map<string, string>();

  const allRows = db.select({ name: entities.name, id: entities.id }).from(entities).all();
  for (const row of allRows) {
    entityLookup.set(row.name.toLowerCase(), { id: row.id, name: row.name });
  }

  const aliasRows = db
    .select({ name: entities.name, aliases: entities.aliases })
    .from(entities)
    .where(isNotNull(entities.aliases))
    .all();
  for (const row of aliasRows) {
    if (!row.aliases) continue;
    for (const raw of row.aliases.split(',')) {
      const alias = raw.trim();
      if (alias.length === 0) continue;
      aliasMap.set(alias.toLowerCase(), row.name);
    }
  }

  return { entityLookup, aliasMap };
}

/**
 * Insert a minimal entity row (name only, defaults for type) and return
 * the generated id alongside the original-case name. The richer entity
 * CRUD surface (aliases, type overrides, ABN, notes) is owned by the
 * core entities module — this is the narrow path import commits take when
 * the user accepts a new entity during a session.
 */
export function createImportEntity(db: FinanceDb, name: string): CreateImportEntityResult {
  const entityId = crypto.randomUUID();
  db.insert(entities)
    .values({ id: entityId, name, lastEditedTime: new Date().toISOString() })
    .run();
  return { entityId, entityName: name };
}

/**
 * Insert a single transaction during the commit phase of an import.
 *
 * Mirrors the in-tree `insertTransaction` shape verbatim so the cutover
 * (PR 3) is a pure routing flip. The full atomic commit pipeline
 * (`commitImport`) remains in-tree for now because it depends on
 * `applyChangeSet` (core/corrections), `applyTagRuleChangeSet`
 * (core/tag-rules), and `reclassifyExistingTransactions` (transactions
 * slice) — cross-slice orchestration the persistence layer should not
 * own.
 *
 * Throws `ImportTransactionPersistError` if the row is not readable
 * after the insert — a defensive check against silent SQLite write
 * failures that the in-tree implementation surfaces as a bare `Error`.
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
