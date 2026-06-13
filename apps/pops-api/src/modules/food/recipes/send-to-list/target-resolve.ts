/**
 * Resolve the send target — either an existing shopping list or a new one.
 *
 * PRD-142 §`sendToList` server-side flow step 2: validate `kind='shopping'`
 * + non-archived for existing; trim + reject empty name for new (then call
 * `createList` with `kind='shopping'`, `ownerApp='food'`).
 */
import { eq } from 'drizzle-orm';

import { createList, type ListsDb, lists } from '@pops/app-lists-db';

import { type SendTarget, type SendToListError } from './types.js';

export type ResolveTargetResult =
  | { ok: true; listId: number; isNew: boolean }
  | { ok: false; reason: SendToListError };

export function resolveTarget(db: ListsDb, target: SendTarget): ResolveTargetResult {
  if (target.kind === 'existing') {
    return resolveExisting(db, target.listId);
  }
  return resolveNew(db, target.name);
}

function resolveExisting(db: ListsDb, listId: number): ResolveTargetResult {
  const row = db.select().from(lists).where(eq(lists.id, listId)).all()[0];
  if (row === undefined) return { ok: false, reason: 'TargetListNotFound' };
  if (row.archivedAt !== null) return { ok: false, reason: 'TargetListArchived' };
  if (row.kind !== 'shopping') return { ok: false, reason: 'TargetListNotShopping' };
  return { ok: true, listId, isNew: false };
}

function resolveNew(db: ListsDb, rawName: string): ResolveTargetResult {
  const name = rawName.trim();
  if (name.length === 0) return { ok: false, reason: 'NameRequiredForNew' };
  const row = createList(db, { name, kind: 'shopping', ownerApp: 'food' });
  return { ok: true, listId: row.id, isNew: true };
}
