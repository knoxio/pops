/**
 * Restore an archived engram back to its original `{type}/{id}.md` location
 * with `status: active`. The inverse of `archiveEngram` (see docs/prds/trust-graduation).
 *
 * Idempotent: restoring an already-active engram (or one whose file is no
 * longer under `.archive/`) is a no-op that returns the current path.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';

import { type CerebrumDb } from '../../../../db/index.js';
import { parseEngramFile, serializeEngram } from '../file.js';
import { ARCHIVE_DIR, absolutePath, parseCustomFields, writeFileAtomic } from './fs-helpers.js';
import { getIndexRow, upsertIndex } from './upsert-index.js';

export type RestoreDeps = {
  root: string;
  db: CerebrumDb;
  now: () => Date;
};

export interface RestoreResult {
  /** Final file path of the restored engram (relative to root). */
  filePath: string;
  /** True if the file was moved out of `.archive/`; false if already active. */
  moved: boolean;
}

export function restoreEngram(deps: RestoreDeps, id: string): RestoreResult {
  const { root, db, now } = deps;
  const row = getIndexRow(db, id);

  if (!row.file_path.startsWith(`${ARCHIVE_DIR}/`)) {
    return { filePath: row.file_path, moved: false };
  }

  const archivedAbs = absolutePath(root, row.file_path);
  // Idempotency: the index still points to `.archive/...` but the file is
  // gone (e.g. a previous revert was interrupted, or the archive was pruned
  // out-of-band). Treat as a no-op rather than throwing on readFileSync.
  if (!existsSync(archivedAbs)) {
    return { filePath: row.file_path, moved: false };
  }
  const existingContent = readFileSync(archivedAbs, 'utf8');
  const { frontmatter, body } = parseEngramFile(existingContent);

  const targetRelPath = `${frontmatter.type}/${id}.md`;
  const targetAbs = absolutePath(root, targetRelPath);

  const nextFrontmatter = {
    ...frontmatter,
    status: 'active' as const,
    modified: now().toISOString(),
  };

  writeFileAtomic(targetAbs, serializeEngram(nextFrontmatter, body));
  if (existsSync(archivedAbs)) unlinkSync(archivedAbs);

  const customFields = row.custom_fields ? parseCustomFields(row.custom_fields) : {};
  upsertIndex(db, {
    id,
    filePath: targetRelPath,
    frontmatter: nextFrontmatter,
    body,
    customFields,
  });

  return { filePath: targetRelPath, moved: true };
}
