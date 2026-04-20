import { and, eq, inArray } from 'drizzle-orm';

import { engramLinks, engramScopes, engramTags } from '@pops/db-types';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

type Tx = Parameters<Parameters<BetterSQLite3Database['transaction']>[0]>[0];

export function syncEngramScopes(tx: Tx, engramId: string, newScopes: string[]): void {
  const currentScopes = tx
    .select({ scope: engramScopes.scope })
    .from(engramScopes)
    .where(eq(engramScopes.engramId, engramId))
    .all()
    .map((r) => r.scope);
  const scopesToDelete = currentScopes.filter((s) => !newScopes.includes(s));
  const scopesToAdd = newScopes.filter((s) => !currentScopes.includes(s));
  if (scopesToDelete.length > 0) {
    tx.delete(engramScopes)
      .where(and(eq(engramScopes.engramId, engramId), inArray(engramScopes.scope, scopesToDelete)))
      .run();
  }
  if (scopesToAdd.length > 0) {
    tx.insert(engramScopes)
      .values(scopesToAdd.map((scope) => ({ engramId, scope })))
      .run();
  }
}

export function syncEngramTags(tx: Tx, engramId: string, newTags: string[]): void {
  const currentTags = tx
    .select({ tag: engramTags.tag })
    .from(engramTags)
    .where(eq(engramTags.engramId, engramId))
    .all()
    .map((r) => r.tag);
  const tagsToDelete = currentTags.filter((t) => !newTags.includes(t));
  const tagsToAdd = newTags.filter((t) => !currentTags.includes(t));
  if (tagsToDelete.length > 0) {
    tx.delete(engramTags)
      .where(and(eq(engramTags.engramId, engramId), inArray(engramTags.tag, tagsToDelete)))
      .run();
  }
  if (tagsToAdd.length > 0) {
    tx.insert(engramTags)
      .values(tagsToAdd.map((tag) => ({ engramId, tag })))
      .run();
  }
}

export function syncEngramLinks(tx: Tx, engramId: string, newLinks: string[]): void {
  const currentLinks = tx
    .select({ targetId: engramLinks.targetId })
    .from(engramLinks)
    .where(eq(engramLinks.sourceId, engramId))
    .all()
    .map((r) => r.targetId);
  const linksToDelete = currentLinks.filter((l) => !newLinks.includes(l));
  const linksToAdd = newLinks.filter((l) => !currentLinks.includes(l));
  if (linksToDelete.length > 0) {
    tx.delete(engramLinks)
      .where(and(eq(engramLinks.sourceId, engramId), inArray(engramLinks.targetId, linksToDelete)))
      .run();
  }
  if (linksToAdd.length > 0) {
    tx.insert(engramLinks)
      .values(linksToAdd.map((targetId) => ({ sourceId: engramId, targetId })))
      .run();
  }
}
