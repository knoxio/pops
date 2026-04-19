import { readFileSync } from 'node:fs';

import { engramIndex, engramLinks, engramScopes, engramTags } from '@pops/db-types';

import { countWords, deriveTitle, parseEngramFile } from '../file.js';
import { absolutePath, dedupe, listEngramFiles, sha256, splitCustomFields } from './fs-helpers.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export function reindexEngrams(db: BetterSQLite3Database, root: string): { indexed: number } {
  const files = listEngramFiles(root);
  const rowsToInsert: {
    row: typeof engramIndex.$inferInsert;
    scopes: string[];
    tags: string[];
    links: string[];
  }[] = [];

  for (const relPath of files) {
    const absPath = absolutePath(root, relPath);
    const content = readFileSync(absPath, 'utf8');
    let parsed;
    try {
      parsed = parseEngramFile(content);
    } catch (err) {
      console.warn(`[cerebrum] Skipping ${relPath}: ${(err as Error).message}`);
      continue;
    }
    const { frontmatter, body } = parsed;
    const title = deriveTitle(body);
    const contentHash = sha256(content);
    const bodyHash = sha256(body);
    const wordCount = countWords(body);
    const { customFields } = splitCustomFields(frontmatter);

    rowsToInsert.push({
      row: {
        id: frontmatter.id,
        filePath: relPath,
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
      },
      scopes: dedupe(frontmatter.scopes),
      tags: dedupe(frontmatter.tags ?? []),
      links: dedupe(frontmatter.links ?? []),
    });
  }

  db.transaction((tx) => {
    tx.delete(engramLinks).run();
    tx.delete(engramTags).run();
    tx.delete(engramScopes).run();
    tx.delete(engramIndex).run();

    for (const entry of rowsToInsert) {
      tx.insert(engramIndex).values(entry.row).run();
      if (entry.scopes.length > 0) {
        tx.insert(engramScopes)
          .values(entry.scopes.map((scope) => ({ engramId: entry.row.id, scope })))
          .run();
      }
      if (entry.tags.length > 0) {
        tx.insert(engramTags)
          .values(entry.tags.map((tag) => ({ engramId: entry.row.id, tag })))
          .run();
      }
      if (entry.links.length > 0) {
        tx.insert(engramLinks)
          .values(entry.links.map((targetId) => ({ sourceId: entry.row.id, targetId })))
          .run();
      }
    }
  });

  return { indexed: rowsToInsert.length };
}
