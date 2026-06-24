/**
 * Pure helpers shared by the engrams data-access layer.
 *
 * Anything that touches the filesystem, parses Markdown, or evaluates
 * scope rules lives in the pillar's engrams module — this file is the
 * SQL-projection seam only.
 */
import type { engramIndex } from '../schema.js';
import type { Engram, EngramSource, EngramStatus, IndexRow } from './engrams-types.js';

export function dedupe<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function parseCustomFields(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function indexRowFromDrizzle(row: typeof engramIndex.$inferSelect): IndexRow {
  return {
    id: row.id,
    filePath: row.filePath,
    type: row.type,
    source: row.source,
    status: row.status,
    template: row.template,
    createdAt: row.createdAt,
    modifiedAt: row.modifiedAt,
    title: row.title,
    contentHash: row.contentHash,
    bodyHash: row.bodyHash ?? null,
    wordCount: row.wordCount,
    customFields: row.customFields,
  };
}

/** Group `{ engramId, value }` rows into a map keyed by engramId. */
export function bucket(rows: { engramId: string; value: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    const existing = out.get(row.engramId);
    if (existing) existing.push(row.value);
    else out.set(row.engramId, [row.value]);
  }
  return out;
}

export function projectEngram(
  row: IndexRow,
  scopes: string[],
  tags: string[],
  links: string[]
): Engram {
  return {
    id: row.id,
    type: row.type,
    scopes,
    tags,
    links,
    created: row.createdAt,
    modified: row.modifiedAt,
    source: row.source as EngramSource,
    status: row.status as EngramStatus,
    template: row.template,
    title: row.title,
    filePath: row.filePath,
    contentHash: row.contentHash,
    wordCount: row.wordCount,
    customFields: parseCustomFields(row.customFields),
  };
}
