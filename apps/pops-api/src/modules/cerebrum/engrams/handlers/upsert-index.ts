import { eq } from 'drizzle-orm';

import { type CerebrumDb } from '@pops/cerebrum-db';
import { engramIndex, engramLinks, engramScopes, engramTags } from '@pops/cerebrum-db';

import { NotFoundError } from '../../../../shared/errors.js';
import { countWords, deriveTitle, serializeEngram } from '../file.js';
import { dedupe, indexRowFromDrizzle, sha256, type IndexRow } from './fs-helpers.js';

import type { EngramFrontmatter } from '../schema.js';

export function getIndexRow(db: CerebrumDb, id: string): IndexRow {
  const row = findIndexRow(db, id);
  if (!row) throw new NotFoundError('Engram', id);
  return row;
}

export function findIndexRow(db: CerebrumDb, id: string): IndexRow | null {
  const [row] = db.select().from(engramIndex).where(eq(engramIndex.id, id)).all();
  return row ? indexRowFromDrizzle(row) : null;
}

export function upsertIndex(
  db: CerebrumDb,
  args: {
    id: string;
    filePath: string;
    frontmatter: EngramFrontmatter;
    body: string;
    customFields: Record<string, unknown>;
  }
): void {
  const { id, filePath, frontmatter, body, customFields } = args;
  const title = deriveTitle(body);
  const contentHash = sha256(serializeEngram(frontmatter, body));
  const bodyHash = sha256(body);
  const wordCount = countWords(body);

  db.transaction((tx) => {
    tx.delete(engramIndex).where(eq(engramIndex.id, id)).run();
    tx.insert(engramIndex)
      .values({
        id,
        filePath,
        type: frontmatter.type,
        source: frontmatter.source,
        status: frontmatter.status,
        template: frontmatter.template ?? null,
        createdAt: frontmatter.created,
        modifiedAt: frontmatter.modified,
        title,
        contentHash,
        bodyHash,
        wordCount,
        customFields: Object.keys(customFields).length > 0 ? JSON.stringify(customFields) : null,
      })
      .run();

    const scopes = dedupe(frontmatter.scopes);
    if (scopes.length > 0) {
      tx.insert(engramScopes)
        .values(scopes.map((scope) => ({ engramId: id, scope })))
        .run();
    }
    const tags = dedupe(frontmatter.tags ?? []);
    if (tags.length > 0) {
      tx.insert(engramTags)
        .values(tags.map((tag) => ({ engramId: id, tag })))
        .run();
    }
    const links = dedupe(frontmatter.links ?? []);
    if (links.length > 0) {
      tx.insert(engramLinks)
        .values(links.map((targetId) => ({ sourceId: id, targetId })))
        .run();
    }
  });
}
