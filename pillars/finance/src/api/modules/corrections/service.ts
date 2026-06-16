/**
 * DB-injected correction-rule ChangeSet application.
 *
 * Ported from the monolith `core/corrections/handlers/apply-corrections.ts`,
 * rewritten to take a `FinanceDb` handle as its first argument and to wrap the
 * whole ChangeSet in a single `db.transaction` so a partial set never lands.
 *
 * `TransactionTagRuleNotFoundError`-style behaviour is preserved: an
 * edit/disable/remove op targeting an unknown id throws `NotFoundError` (→ 404),
 * which inside `db.transaction` rolls the whole set back.
 */
import { desc, eq } from 'drizzle-orm';

import {
  type FinanceDb,
  transactionCorrections,
  transactionCorrectionsService,
} from '../../../db/index.js';
import { NotFoundError } from '../../shared/errors.js';

import type { ChangeSet, ChangeSetOp } from '../../../contract/rest-corrections.js';
import type { CorrectionRow } from './types.js';

const { normalizeDescription } = transactionCorrectionsService;

function applyAddOp(tx: FinanceDb, op: Extract<ChangeSetOp, { op: 'add' }>): void {
  tx.insert(transactionCorrections)
    .values({
      descriptionPattern: normalizeDescription(op.data.descriptionPattern),
      matchType: op.data.matchType,
      entityId: op.data.entityId ?? null,
      entityName: op.data.entityName ?? null,
      location: op.data.location ?? null,
      tags: JSON.stringify(op.data.tags ?? []),
      transactionType: op.data.transactionType ?? null,
      isActive: op.data.isActive ?? true,
      confidence: op.data.confidence ?? 0.5,
    })
    .run();
}

function buildEditUpdates(
  op: Extract<ChangeSetOp, { op: 'edit' }>
): Partial<typeof transactionCorrections.$inferInsert> {
  const updates: Partial<typeof transactionCorrections.$inferInsert> = {};
  if (op.data.entityId !== undefined) updates.entityId = op.data.entityId;
  if (op.data.entityName !== undefined) updates.entityName = op.data.entityName;
  if (op.data.location !== undefined) updates.location = op.data.location;
  if (op.data.tags !== undefined) updates.tags = JSON.stringify(op.data.tags);
  if (op.data.transactionType !== undefined) updates.transactionType = op.data.transactionType;
  if (op.data.isActive !== undefined) updates.isActive = op.data.isActive;
  if (op.data.confidence !== undefined) updates.confidence = op.data.confidence;
  return updates;
}

function applyMutatingOp(tx: FinanceDb, op: Exclude<ChangeSetOp, { op: 'add' }>): void {
  const existing = tx
    .select()
    .from(transactionCorrections)
    .where(eq(transactionCorrections.id, op.id))
    .get();
  if (!existing) throw new NotFoundError('Correction', op.id);

  if (op.op === 'edit') {
    tx.update(transactionCorrections)
      .set(buildEditUpdates(op))
      .where(eq(transactionCorrections.id, op.id))
      .run();
    return;
  }
  if (op.op === 'disable') {
    tx.update(transactionCorrections)
      .set({ isActive: false })
      .where(eq(transactionCorrections.id, op.id))
      .run();
    return;
  }
  tx.delete(transactionCorrections).where(eq(transactionCorrections.id, op.id)).run();
}

/**
 * Apply a ChangeSet atomically and return the full rule set ordered by
 * `confidence DESC, timesApplied DESC`. Ops run in a fixed order
 * (add → edit → disable → remove).
 */
export function applyChangeSet(db: FinanceDb, changeSet: ChangeSet): CorrectionRow[] {
  return db.transaction((tx) => {
    const order: Record<ChangeSetOp['op'], number> = { add: 1, edit: 2, disable: 3, remove: 4 };
    const ops = [...changeSet.ops].toSorted((a, b) => order[a.op] - order[b.op]);

    for (const op of ops) {
      if (op.op === 'add') applyAddOp(tx, op);
      else applyMutatingOp(tx, op);
    }

    return tx
      .select()
      .from(transactionCorrections)
      .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
      .all();
  });
}
