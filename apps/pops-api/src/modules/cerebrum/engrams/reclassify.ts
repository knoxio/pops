import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { eq, inArray, like, or, sql } from 'drizzle-orm';

import { engramIndex, engramScopes } from '@pops/db-types';

import { ValidationError } from '../../../shared/errors.js';
import { parseEngramFile, serializeEngram } from './file.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

interface ReclassifyTarget {
  engramId: string;
  oldScope: string;
  newScope: string;
}

interface WorkItem {
  absPath: string;
  originalContent: string;
  newContent: string;
  id: string;
  newScopesList: string[];
  oldScopeSet: Set<string>;
}

export interface ReclassifyResult {
  affected: number;
  engrams?: string[];
}

function findReclassifyTargets(
  db: BetterSQLite3Database,
  fromScope: string,
  toScope: string
): ReclassifyTarget[] {
  const rows = db
    .select({ engramId: engramScopes.engramId, scope: engramScopes.scope })
    .from(engramScopes)
    .where(or(eq(engramScopes.scope, fromScope), like(engramScopes.scope, `${fromScope}.%`)))
    .all();

  return rows.map((r) => ({
    engramId: r.engramId,
    oldScope: r.scope,
    newScope: r.scope === fromScope ? toScope : `${toScope}${r.scope.slice(fromScope.length)}`,
  }));
}

function writeFileAtomic(absPath: string, contents: string): void {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp.${randomUUID()}`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, absPath);
}

interface EngramReclassEntry {
  oldScopes: Set<string>;
  newScopes: Map<string, string>;
}

function groupByEngram(targets: ReclassifyTarget[]): Map<string, EngramReclassEntry> {
  const byEngram = new Map<string, EngramReclassEntry>();
  for (const t of targets) {
    let entry = byEngram.get(t.engramId);
    if (!entry) {
      entry = { oldScopes: new Set(), newScopes: new Map() };
      byEngram.set(t.engramId, entry);
    }
    entry.oldScopes.add(t.oldScope);
    entry.newScopes.set(t.oldScope, t.newScope);
  }
  return byEngram;
}

function buildWorkItems(
  db: BetterSQLite3Database,
  root: string,
  affectedIds: string[],
  byEngram: Map<string, EngramReclassEntry>
): WorkItem[] {
  const indexRows = db
    .select({ id: engramIndex.id, filePath: engramIndex.filePath })
    .from(engramIndex)
    .where(inArray(engramIndex.id, affectedIds))
    .all();

  const work: WorkItem[] = [];
  for (const row of indexRows) {
    const entry = byEngram.get(row.id);
    if (!entry) continue;

    const absPath = join(root, row.filePath);
    const originalContent = readFileSync(absPath, 'utf8');
    const { frontmatter, body } = parseEngramFile(originalContent);
    const newScopesList = frontmatter.scopes.map((s) => entry.newScopes.get(s) ?? s);
    const newFrontmatter = {
      ...frontmatter,
      scopes: [...new Set(newScopesList)],
      modified: new Date().toISOString(),
    };
    work.push({
      absPath,
      originalContent,
      newContent: serializeEngram(newFrontmatter, body),
      id: row.id,
      newScopesList: newFrontmatter.scopes,
      oldScopeSet: entry.oldScopes,
    });
  }
  return work;
}

function rollbackWrites(written: WorkItem[], context: string): void {
  for (const item of written) {
    try {
      writeFileAtomic(item.absPath, item.originalContent);
    } catch (restoreErr) {
      console.error(
        `[cerebrum] ${context}: failed to restore ${item.absPath}: ${(restoreErr as Error).message}`
      );
    }
  }
}

function writeAllAtomic(work: WorkItem[]): WorkItem[] {
  const written: WorkItem[] = [];
  try {
    for (const item of work) {
      writeFileAtomic(item.absPath, item.newContent);
      written.push(item);
    }
  } catch (err) {
    rollbackWrites(written, 'reclassify rollback');
    throw new ValidationError({
      message: `reclassify failed and was rolled back: ${(err as Error).message}`,
    });
  }
  return written;
}

function applyDbChanges(db: BetterSQLite3Database, work: WorkItem[]): void {
  db.transaction((tx) => {
    for (const item of work) {
      for (const oldScope of item.oldScopeSet) {
        tx.delete(engramScopes)
          .where(sql`${engramScopes.engramId} = ${item.id} AND ${engramScopes.scope} = ${oldScope}`)
          .run();
      }
      for (const newScope of item.newScopesList) {
        tx.insert(engramScopes)
          .values({ engramId: item.id, scope: newScope })
          .onConflictDoNothing()
          .run();
      }
      tx.update(engramIndex)
        .set({ modifiedAt: new Date().toISOString() })
        .where(eq(engramIndex.id, item.id))
        .run();
    }
  });
}

export interface ReclassifyParams {
  fromScope: string;
  toScope: string;
  dryRun?: boolean;
}

export function reclassifyScopes(
  db: BetterSQLite3Database,
  root: string,
  params: ReclassifyParams
): ReclassifyResult {
  const targets = findReclassifyTargets(db, params.fromScope, params.toScope);
  if (targets.length === 0) return { affected: 0 };

  const byEngram = groupByEngram(targets);
  const affectedIds = [...byEngram.keys()];

  if (params.dryRun) return { affected: affectedIds.length, engrams: affectedIds };

  const work = buildWorkItems(db, root, affectedIds, byEngram);
  const written = writeAllAtomic(work);

  try {
    applyDbChanges(db, work);
  } catch (dbErr) {
    rollbackWrites(written, 'reclassify DB rollback');
    throw new ValidationError({
      message: `reclassify DB update failed and file changes were rolled back: ${(dbErr as Error).message}`,
    });
  }

  return { affected: affectedIds.length };
}
