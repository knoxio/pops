import { readFileSync } from 'node:fs';

import { engramIndex, engramLinks, engramScopes, engramTags } from '@pops/db-types';

import { countWords, deriveTitle, parseEngramFile } from '../file.js';
import { absolutePath, dedupe, listEngramFiles, sha256, splitCustomFields } from './fs-helpers.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

interface IndexEntry {
  row: typeof engramIndex.$inferInsert;
  scopes: string[];
  tags: string[];
  links: string[];
}

function buildEntryFromFile(root: string, relPath: string): IndexEntry | null {
  const absPath = absolutePath(root, relPath);
  const content = readFileSync(absPath, 'utf8');
  let parsed;
  try {
    parsed = parseEngramFile(content);
  } catch (err) {
    console.warn(`[cerebrum] Skipping ${relPath}: ${(err as Error).message}`);
    return null;
  }
  const { frontmatter, body } = parsed;
  const { customFields } = splitCustomFields(frontmatter);

  return {
    row: {
      id: frontmatter.id,
      filePath: relPath,
      type: frontmatter.type,
      source: frontmatter.source,
      status: frontmatter.status,
      template: frontmatter.template ?? null,
      createdAt: frontmatter.created,
      modifiedAt: frontmatter.modified,
      title: deriveTitle(body),
      contentHash: sha256(content),
      bodyHash: sha256(body),
      wordCount: countWords(body),
      customFields: Object.keys(customFields).length > 0 ? JSON.stringify(customFields) : null,
    },
    scopes: dedupe(frontmatter.scopes),
    tags: dedupe(frontmatter.tags ?? []),
    links: dedupe(frontmatter.links ?? []),
  };
}

function persistEntries(db: BetterSQLite3Database, entries: IndexEntry[]): void {
  db.transaction((tx) => {
    tx.delete(engramLinks).run();
    tx.delete(engramTags).run();
    tx.delete(engramScopes).run();
    tx.delete(engramIndex).run();

    for (const entry of entries) {
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
}

export function reindexEngrams(db: BetterSQLite3Database, root: string): { indexed: number } {
  const files = listEngramFiles(root);
  const entries: IndexEntry[] = [];

  for (const relPath of files) {
    const entry = buildEntryFromFile(root, relPath);
    if (entry) entries.push(entry);
  }

  persistEntries(db, entries);
  return { indexed: entries.length };
}
