/**
 * FrontmatterSyncService — reads an engram file from disk, parses its
 * frontmatter, and upserts the index + junction tables atomically.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';

import { engramIndex } from '@pops/db-types';

import { countWords, deriveTitle, parseEngramFile } from '../engrams/file.js';
import { syncEngramLinks, syncEngramScopes, syncEngramTags } from './sync-junctions.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { WatchEvent } from './watcher.js';

export interface SyncResult {
  filePath: string;
  status: 'synced' | 'orphaned' | 'error';
  engramId?: string;
  contentHash?: string;
  previousContentHash?: string;
  wordCount?: number;
  bodyText?: string;
  error?: string;
}

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

function readFileContent(absPath: string): { content: string } | { error: string } {
  if (!existsSync(absPath)) return { error: 'file not found' };
  try {
    return { content: readFileSync(absPath, 'utf8') };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function extractCustomFields(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const customFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(key)) customFields[key] = value;
  }
  return customFields;
}

interface IndexValues {
  id: string;
  filePath: string;
  type: string;
  source: string;
  status: string;
  template: string | null;
  createdAt: string;
  modifiedAt: string;
  title: string;
  contentHash: string;
  wordCount: number;
  customFields: string | null;
}

function upsertIndexRow(
  tx: Parameters<Parameters<BetterSQLite3Database['transaction']>[0]>[0],
  values: IndexValues
): void {
  tx.insert(engramIndex)
    .values(values)
    .onConflictDoUpdate({
      target: engramIndex.id,
      set: {
        filePath: values.filePath,
        type: values.type,
        source: values.source,
        status: values.status,
        template: values.template,
        modifiedAt: values.modifiedAt,
        title: values.title,
        contentHash: values.contentHash,
        wordCount: values.wordCount,
        customFields: values.customFields,
      },
    })
    .run();
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
   */
  syncFile(relPath: string): SyncResult {
    const absPath = join(this.root, relPath);
    const read = readFileContent(absPath);
    if ('error' in read) return { filePath: relPath, status: 'error', error: read.error };

    let parsed: ReturnType<typeof parseEngramFile>;
    try {
      parsed = parseEngramFile(read.content);
    } catch (err) {
      return { filePath: relPath, status: 'error', error: (err as Error).message };
    }

    const { frontmatter, body } = parsed;
    const contentHash = sha256(read.content);
    const wordCount = countWords(body);
    const customFields = extractCustomFields(frontmatter as Record<string, unknown>);

    const [existing] = this.db
      .select({ contentHash: engramIndex.contentHash })
      .from(engramIndex)
      .where(eq(engramIndex.id, frontmatter.id))
      .all();
    const previousContentHash = existing?.contentHash ?? null;

    const indexValues: IndexValues = {
      id: frontmatter.id,
      filePath: relPath,
      type: frontmatter.type,
      source: frontmatter.source,
      status: frontmatter.status,
      template: frontmatter.template ?? null,
      createdAt: frontmatter.created,
      modifiedAt: frontmatter.modified,
      title: deriveTitle(body),
      contentHash,
      wordCount,
      customFields: Object.keys(customFields).length > 0 ? JSON.stringify(customFields) : null,
    };

    this.db.transaction((tx) => {
      upsertIndexRow(tx, indexValues);
      syncEngramScopes(tx, frontmatter.id, dedupe(frontmatter.scopes));
      syncEngramTags(tx, frontmatter.id, dedupe(frontmatter.tags ?? []));
      syncEngramLinks(tx, frontmatter.id, dedupe(frontmatter.links ?? []));
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
