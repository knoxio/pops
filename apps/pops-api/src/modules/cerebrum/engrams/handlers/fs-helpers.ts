import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import { eq } from 'drizzle-orm';

import { engramIndex } from '@pops/db-types';

import { ValidationError } from '../../../../shared/errors.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { EngramFrontmatter } from '../schema.js';

export const ARCHIVE_DIR = '.archive';
export const TEMPLATES_DIR = '.templates';
export const CONFIG_DIR = '.config';
export const INDEX_DIR = '.index';
export const WELL_KNOWN_DIRS = new Set([ARCHIVE_DIR, TEMPLATES_DIR, CONFIG_DIR, INDEX_DIR]);

const TYPE_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function assertSafeType(type: string): void {
  if (!TYPE_SEGMENT_PATTERN.test(type) || WELL_KNOWN_DIRS.has(type) || type === 'engrams') {
    throw new ValidationError({
      message: `invalid engram type '${type}' — must be a short lowercase segment`,
    });
  }
}

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

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function writeFileAtomic(absPath: string, contents: string): void {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp.${randomUUID()}`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, absPath);
}

export function absolutePath(root: string, relPath: string): string {
  return join(root, relPath);
}

export function listEngramFiles(root: string): string[] {
  const result: string[] = [];
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (dir === root && WELL_KNOWN_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const rel = relative(root, join(dir, entry.name));
        result.push(rel.split(sep).join('/'));
      }
    }
  };
  if (!existsSync(root)) return [];
  walk(root);
  return result;
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

export function parseCustomFields(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
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

export function splitCustomFields(fm: EngramFrontmatter): {
  customFields: Record<string, unknown>;
} {
  const customFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(key)) customFields[key] = value;
  }
  return { customFields };
}

export function applyTitleChange(body: string, newTitle: string | undefined): string {
  if (!newTitle) return body;
  const lines = body.split('\n');
  const h1Index = lines.findIndex((line) => /^#\s+/.test(line.trim()));
  if (h1Index >= 0) {
    lines[h1Index] = `# ${newTitle}`;
    return lines.join('\n');
  }
  return `# ${newTitle}\n\n${body.trimStart()}`;
}

export type IndexRow = {
  id: string;
  file_path: string;
  type: string;
  source: string;
  status: string;
  template: string | null;
  created_at: string;
  modified_at: string;
  title: string;
  content_hash: string;
  body_hash: string | null;
  word_count: number;
  custom_fields: string | null;
};

export function indexRowFromDrizzle(row: typeof engramIndex.$inferSelect): IndexRow {
  return {
    id: row.id,
    file_path: row.filePath,
    type: row.type,
    source: row.source,
    status: row.status,
    template: row.template,
    created_at: row.createdAt,
    modified_at: row.modifiedAt,
    title: row.title,
    content_hash: row.contentHash,
    body_hash: row.bodyHash ?? null,
    word_count: row.wordCount,
    custom_fields: row.customFields,
  };
}

export function isIdTaken(
  db: BetterSQLite3Database,
  root: string,
  candidate: string,
  type: string
): boolean {
  const [row] = db
    .select({ id: engramIndex.id })
    .from(engramIndex)
    .where(eq(engramIndex.id, candidate))
    .all();
  if (row) return true;
  return existsSync(join(root, type, `${candidate}.md`));
}

export function readFileContent(absPath: string): string {
  return readFileSync(absPath, 'utf8');
}
