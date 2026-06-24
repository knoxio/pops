/**
 * Transaction tag rule persistence for the finance domain.
 *
 * The `transaction_tag_rules` table holds the user's tag-suggestion rules:
 * each row maps a description pattern (exact/contains/regex) to a list of
 * suggested tags, optionally scoped to an entity. The `tags` column is a
 * JSON-encoded `string[]` — there is no SQL foreign key from `tags` to
 * `tag_vocabulary.tag` (the only schema-level FK is `entity_id` →
 * `entities.id`). The logical relationship to the vocabulary is enforced
 * at the application layer.
 *
 * Standard service pattern: db-arg services (callers control the connection
 * and can pass a transaction), plain functions, typed domain errors, no HTTP
 * concerns.
 */
import { desc, eq } from 'drizzle-orm';

import { TransactionTagRuleNotFoundError } from '../errors.js';
import { transactionTagRules } from '../schema.js';

import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape. */
export type TransactionTagRuleRow = typeof transactionTagRules.$inferSelect;

/** Match strategy for the rule's description pattern. */
export type TagRuleMatchType = 'exact' | 'contains' | 'regex';

/** Mutable subset accepted on create. `tags` is the parsed `string[]` form. */
export interface CreateTransactionTagRuleInput {
  descriptionPattern: string;
  matchType: TagRuleMatchType;
  entityId?: string | null;
  tags: string[];
  confidence?: number;
  isActive?: boolean;
  priority?: number;
}

/**
 * PATCH-style update. Deliberately omits `descriptionPattern` and `matchType` —
 * those fields define the rule's identity and are immutable post-create. To
 * replace a pattern the caller deletes the old rule and creates a new one.
 */
export interface UpdateTransactionTagRuleInput {
  entityId?: string | null;
  tags?: string[];
  confidence?: number;
  isActive?: boolean;
  priority?: number;
}

/** List every rule, ordered by `(confidence DESC, times_applied DESC)`. */
export function listTransactionTagRules(db: FinanceDb): TransactionTagRuleRow[] {
  return db
    .select()
    .from(transactionTagRules)
    .orderBy(desc(transactionTagRules.confidence), desc(transactionTagRules.timesApplied))
    .all();
}

/** Get a single rule by id. Throws `TransactionTagRuleNotFoundError` if missing. */
export function getTransactionTagRule(db: FinanceDb, id: string): TransactionTagRuleRow {
  const row = db.select().from(transactionTagRules).where(eq(transactionTagRules.id, id)).get();
  if (!row) throw new TransactionTagRuleNotFoundError(id);
  return row;
}

/**
 * Create a new tag rule. `tags` is JSON-encoded before insert.
 *
 * Defaults: `confidence=0.95`, `isActive=true`, `priority=0`,
 * `timesApplied=0`. The generated `id` is a UUID from drizzle's `$defaultFn`.
 */
export function createTransactionTagRule(
  db: FinanceDb,
  input: CreateTransactionTagRuleInput
): TransactionTagRuleRow {
  const inserted = db
    .insert(transactionTagRules)
    .values({
      descriptionPattern: input.descriptionPattern,
      matchType: input.matchType,
      entityId: input.entityId ?? null,
      tags: JSON.stringify(input.tags),
      confidence: input.confidence ?? 0.95,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 0,
      timesApplied: 0,
    })
    .returning()
    .get();
  return inserted;
}

function buildTagRuleUpdates(
  input: UpdateTransactionTagRuleInput
): Partial<typeof transactionTagRules.$inferInsert> {
  const updates: Partial<typeof transactionTagRules.$inferInsert> = {};
  if (input.entityId !== undefined) updates.entityId = input.entityId ?? null;
  if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);
  if (input.confidence !== undefined) updates.confidence = input.confidence;
  if (input.isActive !== undefined) updates.isActive = input.isActive;
  if (input.priority !== undefined) updates.priority = input.priority;
  return updates;
}

/**
 * Patch a tag rule. Throws `TransactionTagRuleNotFoundError` if missing.
 *
 * An empty `input` is a no-op that still re-reads and returns the row, so
 * callers can use this as a "fetch with optional patch" without branching.
 */
export function updateTransactionTagRule(
  db: FinanceDb,
  id: string,
  input: UpdateTransactionTagRuleInput
): TransactionTagRuleRow {
  getTransactionTagRule(db, id);

  const updates = buildTagRuleUpdates(input);
  if (Object.keys(updates).length > 0) {
    db.update(transactionTagRules).set(updates).where(eq(transactionTagRules.id, id)).run();
  }

  return getTransactionTagRule(db, id);
}

/** Soft-delete: flip `is_active` to `false`. Throws if the id is unknown. */
export function disableTransactionTagRule(db: FinanceDb, id: string): void {
  const result = db
    .update(transactionTagRules)
    .set({ isActive: false })
    .where(eq(transactionTagRules.id, id))
    .run();
  if (result.changes === 0) throw new TransactionTagRuleNotFoundError(id);
}

/** Hard-delete a rule. Throws if the id is unknown. */
export function deleteTransactionTagRule(db: FinanceDb, id: string): void {
  const result = db.delete(transactionTagRules).where(eq(transactionTagRules.id, id)).run();
  if (result.changes === 0) throw new TransactionTagRuleNotFoundError(id);
}
