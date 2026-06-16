/**
 * Resolve the send target — either an existing shopping list or a new one,
 * over the lists REST API. Existing: GET the list header and validate
 * `kind='shopping'` + non-archived. New: trim + reject empty name, then
 * POST a new `kind='shopping'`, `ownerApp='food'` list.
 */
import { type ListsClient } from './lists-client.js';
import { type SendTarget, type SendToListError } from './types.js';

export type ResolveTargetResult =
  | { ok: true; listId: number; isNew: boolean }
  | { ok: false; reason: SendToListError };

export async function resolveTarget(
  client: ListsClient,
  target: SendTarget
): Promise<ResolveTargetResult> {
  if (target.kind === 'existing') return resolveExisting(client, target.listId);
  return resolveNew(client, target.name);
}

async function resolveExisting(client: ListsClient, listId: number): Promise<ResolveTargetResult> {
  const row = await client.getList(listId);
  if (row === null) return { ok: false, reason: 'TargetListNotFound' };
  if (row.archivedAt !== null) return { ok: false, reason: 'TargetListArchived' };
  if (row.kind !== 'shopping') return { ok: false, reason: 'TargetListNotShopping' };
  return { ok: true, listId, isNew: false };
}

async function resolveNew(client: ListsClient, rawName: string): Promise<ResolveTargetResult> {
  const name = rawName.trim();
  if (name.length === 0) return { ok: false, reason: 'NameRequiredForNew' };
  const id = await client.createShoppingList(name);
  return { ok: true, listId: id, isNew: true };
}
