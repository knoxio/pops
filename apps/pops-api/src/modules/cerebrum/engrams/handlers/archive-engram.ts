import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { parseEngramFile, serializeEngram } from '../file.js';
import { ARCHIVE_DIR, absolutePath, parseCustomFields, writeFileAtomic } from './fs-helpers.js';
import { getIndexRow, upsertIndex } from './upsert-index.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export type ArchiveDeps = {
  root: string;
  db: BetterSQLite3Database;
  now: () => Date;
};

export function archiveEngram(deps: ArchiveDeps, id: string): void {
  const { root, db, now } = deps;
  const row = getIndexRow(db, id);
  const existingContent = readFileSync(absolutePath(root, row.file_path), 'utf8');
  const { frontmatter, body } = parseEngramFile(existingContent);

  if (frontmatter.status === 'archived') return;

  const nextFrontmatter = {
    ...frontmatter,
    status: 'archived' as const,
    modified: now().toISOString(),
  };

  const archivedPath = join(ARCHIVE_DIR, row.file_path);
  const archivedAbs = absolutePath(root, archivedPath);
  mkdirSync(dirname(archivedAbs), { recursive: true });

  writeFileAtomic(archivedAbs, serializeEngram(nextFrontmatter, body));

  const sourceAbs = absolutePath(root, row.file_path);
  if (existsSync(sourceAbs)) unlinkSync(sourceAbs);

  const customFields = row.custom_fields ? parseCustomFields(row.custom_fields) : {};
  upsertIndex(db, { id, filePath: archivedPath, frontmatter: nextFrontmatter, body, customFields });
}
