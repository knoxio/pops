import { readFileSync } from 'node:fs';

import { sql } from 'drizzle-orm';

import { engramLinks } from '@pops/db-types';

import { ValidationError } from '../../../../shared/errors.js';
import { parseEngramFile, serializeEngram } from '../file.js';
import { absolutePath, parseCustomFields, writeFileAtomic } from './fs-helpers.js';
import { findIndexRow, getIndexRow, upsertIndex } from './upsert-index.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { EngramFrontmatter } from '../schema.js';

export type LinkDeps = {
  root: string;
  db: BetterSQLite3Database;
  now: () => Date;
};

export function linkEngrams(deps: LinkDeps, sourceId: string, targetId: string): void {
  const { db, now } = deps;
  if (sourceId === targetId) {
    throw new ValidationError({ message: 'cannot link an engram to itself' });
  }
  getIndexRow(db, sourceId);
  const targetRow = findIndexRow(db, targetId);

  mutateFrontmatter(deps, sourceId, (fm) => {
    const links = new Set(fm.links ?? []);
    links.add(targetId);
    return { ...fm, links: [...links], modified: now().toISOString() };
  });

  if (targetRow) {
    mutateFrontmatter(deps, targetId, (fm) => {
      const links = new Set(fm.links ?? []);
      links.add(sourceId);
      return { ...fm, links: [...links], modified: now().toISOString() };
    });
  }

  db.insert(engramLinks)
    .values([
      { sourceId, targetId },
      ...(targetRow ? [{ sourceId: targetId, targetId: sourceId }] : []),
    ])
    .onConflictDoNothing()
    .run();
}

export function unlinkEngrams(deps: LinkDeps, sourceId: string, targetId: string): void {
  const { db, now } = deps;
  getIndexRow(db, sourceId);
  const targetRow = findIndexRow(db, targetId);

  mutateFrontmatter(deps, sourceId, (fm) => ({
    ...fm,
    links: (fm.links ?? []).filter((l) => l !== targetId),
    modified: now().toISOString(),
  }));

  if (targetRow) {
    mutateFrontmatter(deps, targetId, (fm) => ({
      ...fm,
      links: (fm.links ?? []).filter((l) => l !== sourceId),
      modified: now().toISOString(),
    }));
  }

  db.delete(engramLinks)
    .where(
      sql`(${engramLinks.sourceId} = ${sourceId} AND ${engramLinks.targetId} = ${targetId}) OR (${engramLinks.sourceId} = ${targetId} AND ${engramLinks.targetId} = ${sourceId})`
    )
    .run();
}

export function mutateFrontmatter(
  deps: LinkDeps,
  id: string,
  transform: (fm: EngramFrontmatter) => EngramFrontmatter
): void {
  const { db, root } = deps;
  const row = getIndexRow(db, id);
  const content = readFileSync(absolutePath(root, row.file_path), 'utf8');
  const { frontmatter, body } = parseEngramFile(content);
  const next = transform(frontmatter);
  writeFileAtomic(absolutePath(root, row.file_path), serializeEngram(next, body));
  const customFields = row.custom_fields ? parseCustomFields(row.custom_fields) : {};
  upsertIndex(db, { id, filePath: row.file_path, frontmatter: next, body, customFields });
}
