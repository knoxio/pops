/**
 * FrontmatterSyncService — reads an engram file from disk, parses its
 * frontmatter, and upserts the index + junction tables atomically.
 *
 * Design:
 *  - Single source of truth is the file; the index is a rebuildable cache.
 *  - Junction tables (scopes/tags/links) are diffed on every sync so a
 *    hand-edit that removes a scope is reflected immediately.
 *  - Parse errors are surfaced as `{ status: 'error' }` results — the caller
 *    decides whether to log or escalate.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { and, eq, inArray } from 'drizzle-orm';

import { engramIndex, engramLinks, engramScopes, engramTags } from '@pops/db-types';

import { countWords, deriveTitle, parseEngramFile } from '../engrams/file.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { WatchEvent } from './watcher.js';

export interface SyncResult {
  filePath: string;
  status: 'synced' | 'orphaned' | 'error';
  engramId?: string;
  contentHash?: string;
  previousContentHash?: string;
  wordCount?: number;
  /** Body text (frontmatter stripped) — used as the embedding job payload so the worker doesn't re-read the file. */
  bodyText?: string;
  error?: string;
}

/** Known frontmatter keys — everything else is a custom field. */
const KNOWN_FRONTMATTER_KEYS = new Set<string>([
  'id',
  'type',
  'scopes',
  'created',
  'modified',
  'source',
  'tags',
  'links',
  'status',
  'template',
]);

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export class FrontmatterSyncService {
  constructor(
    private readonly root: string,
    private readonly db: BetterSQLite3Database
  ) {}

  /**
   * Process a batch of watch events. `delete` events mark the entry orphaned;
   * `create` and `modify` events attempt a full sync.
   */
  async processEvents(events: WatchEvent[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const event of events) {
      if (event.type === 'delete') {
        this.markOrphaned(event.filePath);
        results.push({ filePath: event.filePath, status: 'orphaned' });
      } else {
        results.push(this.syncFile(event.filePath));
      }
    }
    return results;
  }

  /**
   * Sync a single file: read → parse → upsert index + junction tables.
   * Returns `status: 'error'` with a message if parsing fails or the file
   * is missing.
   */
  syncFile(relPath: string): SyncResult {
    const absPath = join(this.root, relPath);
    if (!existsSync(absPath)) {
      return { filePath: relPath, status: 'error', error: 'file not found' };
    }

    let content: string;
    try {
      content = readFileSync(absPath, 'utf8');
    } catch (err) {
      return { filePath: relPath, status: 'error', error: (err as Error).message };
    }

    let parsed: ReturnType<typeof parseEngramFile>;
    try {
      parsed = parseEngramFile(content);
    } catch (err) {
      return { filePath: relPath, status: 'error', error: (err as Error).message };
    }

    const { frontmatter, body } = parsed;
    const contentHash = sha256(content);
    const wordCount = countWords(body);
    const title = deriveTitle(body);

    // Compute custom fields (everything not in known keys).
    const customFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(frontmatter)) {
      if (!KNOWN_FRONTMATTER_KEYS.has(key)) customFields[key] = value;
    }

    // Get previous hash before we overwrite the row.
    const [existing] = this.db
      .select({ contentHash: engramIndex.contentHash })
      .from(engramIndex)
      .where(eq(engramIndex.id, frontmatter.id))
      .all();
    const previousContentHash = existing?.contentHash ?? null;

    // Diff junction tables.
    const newScopes = dedupe(frontmatter.scopes);
    const newTags = dedupe(frontmatter.tags ?? []);
    const newLinks = dedupe(frontmatter.links ?? []);

    this.db.transaction((tx) => {
      // Upsert index row without deleting — preserves junction rows so the diffs below see current state.
      const indexValues = {
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
        wordCount,
        customFields: Object.keys(customFields).length > 0 ? JSON.stringify(customFields) : null,
      };
      tx.insert(engramIndex)
        .values(indexValues)
        .onConflictDoUpdate({
          target: engramIndex.id,
          set: {
            filePath: indexValues.filePath,
            type: indexValues.type,
            source: indexValues.source,
            status: indexValues.status,
            template: indexValues.template,
            modifiedAt: indexValues.modifiedAt,
            title: indexValues.title,
            contentHash: indexValues.contentHash,
            wordCount: indexValues.wordCount,
            customFields: indexValues.customFields,
          },
        })
        .run();

      // Diff scopes.
      const currentScopes = tx
        .select({ scope: engramScopes.scope })
        .from(engramScopes)
        .where(eq(engramScopes.engramId, frontmatter.id))
        .all()
        .map((r) => r.scope);
      const scopesToDelete = currentScopes.filter((s) => !newScopes.includes(s));
      const scopesToAdd = newScopes.filter((s) => !currentScopes.includes(s));
      if (scopesToDelete.length > 0) {
        tx.delete(engramScopes)
          .where(
            and(
              eq(engramScopes.engramId, frontmatter.id),
              inArray(engramScopes.scope, scopesToDelete)
            )
          )
          .run();
      }
      if (scopesToAdd.length > 0) {
        tx.insert(engramScopes)
          .values(scopesToAdd.map((scope) => ({ engramId: frontmatter.id, scope })))
          .run();
      }

      // Diff tags.
      const currentTags = tx
        .select({ tag: engramTags.tag })
        .from(engramTags)
        .where(eq(engramTags.engramId, frontmatter.id))
        .all()
        .map((r) => r.tag);
      const tagsToDelete = currentTags.filter((t) => !newTags.includes(t));
      const tagsToAdd = newTags.filter((t) => !currentTags.includes(t));
      if (tagsToDelete.length > 0) {
        tx.delete(engramTags)
          .where(
            and(eq(engramTags.engramId, frontmatter.id), inArray(engramTags.tag, tagsToDelete))
          )
          .run();
      }
      if (tagsToAdd.length > 0) {
        tx.insert(engramTags)
          .values(tagsToAdd.map((tag) => ({ engramId: frontmatter.id, tag })))
          .run();
      }

      // Diff links.
      const currentLinks = tx
        .select({ targetId: engramLinks.targetId })
        .from(engramLinks)
        .where(eq(engramLinks.sourceId, frontmatter.id))
        .all()
        .map((r) => r.targetId);
      const linksToDelete = currentLinks.filter((l) => !newLinks.includes(l));
      const linksToAdd = newLinks.filter((l) => !currentLinks.includes(l));
      if (linksToDelete.length > 0) {
        tx.delete(engramLinks)
          .where(
            and(
              eq(engramLinks.sourceId, frontmatter.id),
              inArray(engramLinks.targetId, linksToDelete)
            )
          )
          .run();
      }
      if (linksToAdd.length > 0) {
        tx.insert(engramLinks)
          .values(linksToAdd.map((targetId) => ({ sourceId: frontmatter.id, targetId })))
          .run();
      }
    });

    return {
      filePath: relPath,
      status: 'synced',
      engramId: frontmatter.id,
      contentHash,
      previousContentHash: previousContentHash ?? undefined,
      wordCount,
      bodyText: body,
    };
  }

  /**
   * Mark an indexed engram as orphaned (file was deleted from disk).
   * Logs a warning — the index row is kept for audit purposes.
   */
  markOrphaned(relPath: string): void {
    const rows = this.db
      .update(engramIndex)
      .set({ status: 'orphaned' })
      .where(eq(engramIndex.filePath, relPath))
      .returning({ id: engramIndex.id })
      .all();

    if (rows.length > 0) {
      console.warn(
        `[thalamus] Engram orphaned (file deleted): ${relPath} (id: ${rows[0]?.id ?? 'unknown'})`
      );
    }
  }
}
