import { NotFoundError } from '../../../shared/errors.js';
import { normalizeDescription } from './types.js';

import type { ChangeSet, ChangeSetOp, CorrectionRow } from './types.js';

function makeAddedRow(op: Extract<ChangeSetOp, { op: 'add' }>, tempId: string): CorrectionRow {
  return {
    id: tempId,
    descriptionPattern: normalizeDescription(op.data.descriptionPattern),
    matchType: op.data.matchType,
    entityId: op.data.entityId ?? null,
    entityName: op.data.entityName ?? null,
    location: op.data.location ?? null,
    tags: JSON.stringify(op.data.tags ?? []),
    transactionType: op.data.transactionType ?? null,
    isActive: op.data.isActive ?? true,
    confidence: op.data.confidence ?? 0.5,
    priority: op.data.priority ?? 0,
    timesApplied: 0,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
}

function withDefined<T>(provided: T | undefined, fallback: T): T {
  return provided ?? fallback;
}

function applyEditOpInMemory(
  existing: CorrectionRow,
  op: Extract<ChangeSetOp, { op: 'edit' }>
): CorrectionRow {
  return {
    ...existing,
    entityId: withDefined(op.data.entityId, existing.entityId),
    entityName: withDefined(op.data.entityName, existing.entityName),
    location: withDefined(op.data.location, existing.location),
    tags: op.data.tags !== undefined ? JSON.stringify(op.data.tags) : existing.tags,
    transactionType: withDefined(op.data.transactionType, existing.transactionType),
    isActive:
      op.data.isActive !== undefined ? Boolean(op.data.isActive) : Boolean(existing.isActive),
    confidence: withDefined(op.data.confidence, existing.confidence),
  };
}

function applyMutatingInMemory(
  next: CorrectionRow[],
  byId: Map<string, CorrectionRow>,
  op: Exclude<ChangeSetOp, { op: 'add' }>
): void {
  const existing = byId.get(op.id);
  if (!existing) throw new NotFoundError('Correction', op.id);

  if (op.op === 'edit') {
    const updated = applyEditOpInMemory(existing, op);
    const idx = next.findIndex((r) => r.id === existing.id);
    if (idx !== -1) next[idx] = updated;
    byId.set(existing.id, updated);
    return;
  }
  if (op.op === 'disable') {
    const updated = { ...existing, isActive: false };
    const idx = next.findIndex((r) => r.id === existing.id);
    if (idx !== -1) next[idx] = updated;
    byId.set(existing.id, updated);
    return;
  }
  const idx = next.findIndex((r) => r.id === existing.id);
  if (idx !== -1) next.splice(idx, 1);
  byId.delete(existing.id);
}

export function applyChangeSetToRules(
  rules: CorrectionRow[],
  changeSet: ChangeSet
): CorrectionRow[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const next: CorrectionRow[] = [...rules];

  let tempCounter = 0;
  const order: Record<ChangeSetOp['op'], number> = { add: 1, edit: 2, disable: 3, remove: 4 };
  const ops = [...changeSet.ops].toSorted((a, b) => order[a.op] - order[b.op]);

  for (const op of ops) {
    if (op.op === 'add') {
      tempCounter += 1;
      next.push(makeAddedRow(op, `temp:${tempCounter}`));
    } else {
      applyMutatingInMemory(next, byId, op);
    }
  }

  return next;
}
