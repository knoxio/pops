/**
 * Engram type change with file move (PRD-081 US-03 AC #6).
 *
 * Quick-captured engrams land in `captures/{id}.md`. When the curation worker
 * classifies them with high confidence into a real type (idea, note, ...), the
 * file has to move to `{type}/{id}.md`. The id is unchanged, so any links
 * pointing at this engram continue to resolve.
 *
 * Atomicity: write the new file → upsert the index pointing at the new path →
 * unlink the old file. If the index upsert fails, the freshly-written file is
 * removed and the old file remains the source of truth. If the final unlink
 * fails, two files exist for one engram but the index points at the new
 * (correct) one — reconcilable via `reindex`.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';

import { type CerebrumDb } from '../../../../db/index.js';
import { ValidationError } from '../../../shared/errors.js';
import { parseEngramFile, serializeEngram } from '../file.js';
import { absolutePath, assertSafeType, parseCustomFields, writeFileAtomic } from './fs-helpers.js';
import { getIndexRow, upsertIndex } from './upsert-index.js';

export type ChangeTypeDeps = {
  root: string;
  db: CerebrumDb;
  now: () => Date;
};

export function changeEngramType(deps: ChangeTypeDeps, id: string, newType: string): void {
  const { root, db, now } = deps;
  assertSafeType(newType);

  const row = getIndexRow(db, id);
  if (row.type === newType) return;

  const oldRelPath = row.file_path;
  const newRelPath = `${newType}/${id}.md`;
  const oldAbs = absolutePath(root, oldRelPath);
  const newAbs = absolutePath(root, newRelPath);

  if (existsSync(newAbs)) {
    throw new ValidationError({
      message: `cannot change engram '${id}' type to '${newType}': target path '${newRelPath}' already exists`,
    });
  }

  const { frontmatter, body } = parseEngramFile(readFileSync(oldAbs, 'utf8'));
  const nextFrontmatter = {
    ...frontmatter,
    type: newType,
    modified: now().toISOString(),
  };
  const customFields = row.custom_fields ? parseCustomFields(row.custom_fields) : {};

  writeFileAtomic(newAbs, serializeEngram(nextFrontmatter, body));
  try {
    upsertIndex(db, {
      id,
      filePath: newRelPath,
      frontmatter: nextFrontmatter,
      body,
      customFields,
    });
  } catch (err) {
    if (existsSync(newAbs)) unlinkSync(newAbs);
    throw err;
  }
  if (existsSync(oldAbs)) unlinkSync(oldAbs);
}
