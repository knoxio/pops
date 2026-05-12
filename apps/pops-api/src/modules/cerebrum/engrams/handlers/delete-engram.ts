/**
 * Hard-delete an engram: remove the file, the index row (cascading scopes,
 * tags, and outbound links), strip any inbound link rows pointing at this id,
 * and rewrite the frontmatter of inbound-linking engrams so their `links:`
 * arrays no longer reference the deleted id.
 *
 * Used by consolidate revert (PRD-086 US-04) to remove the merged engram.
 * Idempotent: missing files or missing index rows are no-ops.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';

import { eq } from 'drizzle-orm';

import { engramIndex, engramLinks } from '@pops/db-types';

import { parseEngramFile, serializeEngram } from '../file.js';
import { absolutePath, parseCustomFields, writeFileAtomic } from './fs-helpers.js';
import { findIndexRow, upsertIndex } from './upsert-index.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export type DeleteDeps = {
  root: string;
  db: BetterSQLite3Database;
  now: () => Date;
};

export interface DeleteResult {
  /** True if a file was removed from disk. */
  fileRemoved: boolean;
  /** True if an index row was removed. */
  indexRemoved: boolean;
  /** IDs of engrams whose `links:` arrays were rewritten to drop the deleted id. */
  inboundLinkSourcesRewritten: string[];
}

export function deleteEngram(deps: DeleteDeps, id: string): DeleteResult {
  const { root, db, now } = deps;
  const row = findIndexRow(db, id);

  const inboundSources = db
    .select({ sourceId: engramLinks.sourceId })
    .from(engramLinks)
    .where(eq(engramLinks.targetId, id))
    .all()
    .map((r) => r.sourceId);

  const rewritten: string[] = [];
  for (const sourceId of inboundSources) {
    if (sourceId === id) continue;
    if (stripFrontmatterLink({ root, db, now }, sourceId, id)) {
      rewritten.push(sourceId);
    }
  }

  let fileRemoved = false;
  let indexRemoved = false;

  if (row) {
    const abs = absolutePath(root, row.file_path);
    if (existsSync(abs)) {
      unlinkSync(abs);
      fileRemoved = true;
    }
    db.transaction((tx) => {
      tx.delete(engramLinks).where(eq(engramLinks.targetId, id)).run();
      // Outbound links + scopes + tags cascade on engram_index.id delete.
      tx.delete(engramIndex).where(eq(engramIndex.id, id)).run();
    });
    indexRemoved = true;
  } else {
    db.delete(engramLinks).where(eq(engramLinks.targetId, id)).run();
  }

  return { fileRemoved, indexRemoved, inboundLinkSourcesRewritten: rewritten };
}

/**
 * Remove `targetId` from `sourceId`'s frontmatter `links` array. Returns
 * `true` if a rewrite occurred. No-ops when the source is missing or did not
 * actually reference the target.
 */
function stripFrontmatterLink(
  deps: { root: string; db: BetterSQLite3Database; now: () => Date },
  sourceId: string,
  targetId: string
): boolean {
  const { root, db, now } = deps;
  const sourceRow = findIndexRow(db, sourceId);
  if (!sourceRow) return false;

  const sourceAbs = absolutePath(root, sourceRow.file_path);
  if (!existsSync(sourceAbs)) return false;

  const content = readFileSync(sourceAbs, 'utf8');
  const { frontmatter, body } = parseEngramFile(content);
  const existing = frontmatter.links ?? [];
  if (!existing.includes(targetId)) return false;

  const nextLinks = existing.filter((l) => l !== targetId);
  const { links: _links, ...rest } = frontmatter;
  const nextFrontmatter = {
    ...rest,
    modified: now().toISOString(),
    ...(nextLinks.length > 0 ? { links: nextLinks } : {}),
  };

  writeFileAtomic(sourceAbs, serializeEngram(nextFrontmatter, body));
  const customFields = sourceRow.custom_fields ? parseCustomFields(sourceRow.custom_fields) : {};
  upsertIndex(db, {
    id: sourceId,
    filePath: sourceRow.file_path,
    frontmatter: nextFrontmatter,
    body,
    customFields,
  });
  return true;
}
