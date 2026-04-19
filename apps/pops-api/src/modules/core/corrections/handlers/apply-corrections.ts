import { desc, eq } from 'drizzle-orm';

import { transactionCorrections } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { NotFoundError } from '../../../../shared/errors.js';
import { normalizeDescription } from '../types.js';

import type { ChangeSet, ChangeSetOp, CorrectionRow } from '../types.js';

export function applyChangeSet(changeSet: ChangeSet): CorrectionRow[] {
  const db = getDrizzle();

  return db.transaction((tx) => {
    const order: Record<ChangeSetOp['op'], number> = { add: 1, edit: 2, disable: 3, remove: 4 };
    const ops = [...changeSet.ops].toSorted((a, b) => order[a.op] - order[b.op]);

    for (const op of ops) {
      if (op.op === 'add') {
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
        continue;
      }

      const existing = tx
        .select()
        .from(transactionCorrections)
        .where(eq(transactionCorrections.id, op.id))
        .get();
      if (!existing) throw new NotFoundError('Correction', op.id);

      if (op.op === 'edit') {
        const updates: Partial<typeof transactionCorrections.$inferInsert> = {};
        if (op.data.entityId !== undefined) updates.entityId = op.data.entityId;
        if (op.data.entityName !== undefined) updates.entityName = op.data.entityName;
        if (op.data.location !== undefined) updates.location = op.data.location;
        if (op.data.tags !== undefined) updates.tags = JSON.stringify(op.data.tags);
        if (op.data.transactionType !== undefined)
          updates.transactionType = op.data.transactionType;
        if (op.data.isActive !== undefined) updates.isActive = op.data.isActive;
        if (op.data.confidence !== undefined) updates.confidence = op.data.confidence;

        tx.update(transactionCorrections)
          .set(updates)
          .where(eq(transactionCorrections.id, op.id))
          .run();
        continue;
      }

      if (op.op === 'disable') {
        tx.update(transactionCorrections)
          .set({ isActive: false })
          .where(eq(transactionCorrections.id, op.id))
          .run();
        continue;
      }

      tx.delete(transactionCorrections).where(eq(transactionCorrections.id, op.id)).run();
    }

    return tx
      .select()
      .from(transactionCorrections)
      .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
      .all();
  });
}
