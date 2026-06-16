/**
 * Transactions CRUD against finance's SQLite via drizzle.
 *
 * Mirrors the wish-list pattern: db-arg services, typed domain errors,
 * no HTTP / tRPC concerns. The in-tree service at
 * `apps/pops-api/src/modules/finance/transactions/service.ts` still
 * uses `getDrizzle()`; this package version takes a `FinanceDb` handle
 * as its first argument. PR 3 of phase 1 flips the router to call into
 * here.
 *
 * The `tags` column is stored as a JSON-encoded array of strings — the
 * caller passes a `string[]` and persists `JSON.stringify(...)`. The
 * parsing back into a `string[]` is the responsibility of the API
 * presentation layer (it stays out of the persistence service so the
 * raw row shape stays Drizzle-native).
 *
 * `restoreTransaction` exists for the Undo flow: delete returns the
 * raw row snapshot, restore re-inserts it preserving the original `id`,
 * `checksum`, `rawRow`, and `notionId` so dedup metadata is intact and
 * any downstream link that still points at the original id resolves
 * again.
 */
import { and, count, desc, eq, gte, like, lte, type SQL, sql } from 'drizzle-orm';

import { TransactionAlreadyExistsError, TransactionNotFoundError } from '../errors.js';
import { transactions } from '../schema.js';

import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape — exposed so callers can reuse the inferred select type. */
export type TransactionRow = typeof transactions.$inferSelect;

/** Mutable subset accepted on create. `notionId` stays the import/sync layer's job. */
export interface CreateTransactionInput {
  description: string;
  account: string;
  amount: number;
  date: string;
  type?: string | undefined;
  tags?: string[] | undefined;
  entityId?: string | null | undefined;
  entityName?: string | null | undefined;
  location?: string | null | undefined;
  country?: string | null | undefined;
  relatedTransactionId?: string | null | undefined;
  notes?: string | null | undefined;
  /** Import-only: raw CSV row for audit trail. */
  rawRow?: string | null | undefined;
  /** Import-only: checksum for dedup. */
  checksum?: string | null | undefined;
}

/** Same shape as create — all fields optional for PATCH semantics. */
export interface UpdateTransactionInput {
  description?: string;
  account?: string;
  amount?: number;
  date?: string;
  type?: string;
  tags?: string[];
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  country?: string | null;
  relatedTransactionId?: string | null;
  notes?: string | null;
}

/** Filters accepted by `listTransactions`. */
export interface TransactionFilters {
  search?: string | undefined;
  account?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  tag?: string | undefined;
  entityId?: string | undefined;
  type?: string | undefined;
}

/** Count + rows for a paginated list. */
export interface TransactionListResult {
  rows: TransactionRow[];
  total: number;
}

function buildListConditions(filters: TransactionFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.search) {
    conditions.push(like(transactions.description, `%${filters.search}%`));
  }
  if (filters.account) {
    conditions.push(eq(transactions.account, filters.account));
  }
  if (filters.startDate) {
    conditions.push(gte(transactions.date, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(transactions.date, filters.endDate));
  }
  if (filters.tag) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(${transactions.tags}) WHERE json_each.value = ${filters.tag})`
    );
  }
  if (filters.entityId) {
    conditions.push(eq(transactions.entityId, filters.entityId));
  }
  if (filters.type) {
    conditions.push(eq(transactions.type, filters.type));
  }
  return conditions;
}

/** List transactions with optional filters. Sorted by date DESC, newest first. */
export function listTransactions(
  db: FinanceDb,
  filters: TransactionFilters,
  limit: number,
  offset: number
): TransactionListResult {
  const conditions = buildListConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.date))
    .limit(limit)
    .offset(offset)
    .all();
  const countRow = db.select({ total: count() }).from(transactions).where(where).all()[0];

  return { rows, total: countRow?.total ?? 0 };
}

/** Get a single transaction by id. Throws `TransactionNotFoundError` if missing. */
export function getTransaction(db: FinanceDb, id: string): TransactionRow {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) throw new TransactionNotFoundError(id);
  return row;
}

/**
 * Create a new transaction. Generates a UUID, persists, and returns the row.
 *
 * `type` defaults to '' for parity with the in-tree service — the column is
 * `NOT NULL` and historic rows have empty-string defaults rather than a real
 * categorisation. `tags` defaults to `[]` serialised.
 */
export function createTransaction(db: FinanceDb, input: CreateTransactionInput): TransactionRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(transactions)
    .values({
      id,
      description: input.description,
      account: input.account,
      amount: input.amount,
      date: input.date,
      type: input.type ?? '',
      tags: JSON.stringify(input.tags ?? []),
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      location: input.location ?? null,
      country: input.country ?? null,
      relatedTransactionId: input.relatedTransactionId ?? null,
      notes: input.notes ?? null,
      checksum: input.checksum ?? null,
      rawRow: input.rawRow ?? null,
      lastEditedTime: now,
    })
    .run();

  return getTransaction(db, id);
}

type TransactionUpdate = Partial<typeof transactions.$inferInsert>;

function applyCoreFields(input: UpdateTransactionInput, updates: TransactionUpdate): void {
  if (input.description !== undefined) updates.description = input.description;
  if (input.account !== undefined) updates.account = input.account;
  if (input.amount !== undefined) updates.amount = input.amount;
  if (input.date !== undefined) updates.date = input.date;
  if (input.type !== undefined) updates.type = input.type;
  if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);
}

function applyEntityFields(input: UpdateTransactionInput, updates: TransactionUpdate): void {
  if (input.entityId !== undefined) updates.entityId = input.entityId ?? null;
  if (input.entityName !== undefined) updates.entityName = input.entityName ?? null;
}

function applyLocationFields(input: UpdateTransactionInput, updates: TransactionUpdate): void {
  if (input.location !== undefined) updates.location = input.location ?? null;
  if (input.country !== undefined) updates.country = input.country ?? null;
}

function applyMetadataFields(input: UpdateTransactionInput, updates: TransactionUpdate): void {
  if (input.relatedTransactionId !== undefined) {
    updates.relatedTransactionId = input.relatedTransactionId ?? null;
  }
  if (input.notes !== undefined) updates.notes = input.notes ?? null;
}

function buildTransactionUpdates(input: UpdateTransactionInput): TransactionUpdate {
  const updates: TransactionUpdate = {};
  applyCoreFields(input, updates);
  applyEntityFields(input, updates);
  applyLocationFields(input, updates);
  applyMetadataFields(input, updates);
  return updates;
}

/**
 * Patch a transaction. Throws `TransactionNotFoundError` if missing.
 * No-op writes (empty `input`) still re-read the row but skip the UPDATE.
 */
export function updateTransaction(
  db: FinanceDb,
  id: string,
  input: UpdateTransactionInput
): TransactionRow {
  getTransaction(db, id);

  const updates = buildTransactionUpdates(input);
  if (Object.keys(updates).length > 0) {
    updates.lastEditedTime = new Date().toISOString();
    db.update(transactions).set(updates).where(eq(transactions.id, id)).run();
  }

  return getTransaction(db, id);
}

/**
 * Delete a transaction by id. Throws `TransactionNotFoundError` if missing.
 *
 * Returns the deleted row snapshot so a caller can hand it to
 * `restoreTransaction` for an Undo flow.
 */
export function deleteTransaction(db: FinanceDb, id: string): TransactionRow {
  const snapshot = getTransaction(db, id);

  const result = db.delete(transactions).where(eq(transactions.id, id)).run();
  if (result.changes === 0) throw new TransactionNotFoundError(id);
  return snapshot;
}

/**
 * Restore a previously-deleted transaction from a server-issued snapshot.
 *
 * Re-inserts preserving the original id, checksum, raw_row, and notion_id
 * so dedup metadata is intact. Throws `TransactionAlreadyExistsError` if a
 * row with the same id is already present (caller should handle that case).
 */
export function restoreTransaction(db: FinanceDb, snapshot: TransactionRow): TransactionRow {
  const existing = db.select().from(transactions).where(eq(transactions.id, snapshot.id)).get();
  if (existing) {
    throw new TransactionAlreadyExistsError(snapshot.id);
  }
  db.insert(transactions).values(snapshot).run();
  return getTransaction(db, snapshot.id);
}

export {
  collectAvailableTags,
  type DescriptionPreviewResult,
  type DescriptionPreviewRow,
  listDescriptionsForPreview,
} from './transactions-reads.js';
