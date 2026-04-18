/**
 * Engram CRUD service — the only code that writes to the filesystem and the
 * engram index. The file is always the source of truth; the index is a
 * rebuildable cache of the frontmatter.
 *
 * Invariants:
 *  - Every write writes the file atomically (temp + rename) before touching
 *    the index, so a crash mid-write never leaves a ghost index row.
 *  - `modified` frontmatter is set on every write, including link-only edits.
 *  - Links are bidirectional — linking A→B writes both files.
 *  - Deletes move to `.archive/` with the original type subdirectory preserved.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import { and, count, eq, inArray, like, sql } from 'drizzle-orm';

import { engramIndex, engramLinks, engramScopes, engramTags } from '@pops/db-types';

import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { applyTemplate } from '../templates/apply.js';
import { countWords, deriveTitle, parseEngramFile, serializeEngram } from './file.js';
import { generateEngramId } from './id.js';
import {
  canTransitionStatus,
  ENGRAM_ID_PATTERN,
  type EngramFrontmatter,
  type EngramSource,
  type EngramStatus,
} from './schema.js';
import { buildEngram, type Engram } from './types.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { TemplateRegistry } from '../templates/registry.js';
import type { ScopeRuleEngine } from './scope-rules.js';

const ARCHIVE_DIR = '.archive';
const TEMPLATES_DIR = '.templates';
const CONFIG_DIR = '.config';
const INDEX_DIR = '.index';
const WELL_KNOWN_DIRS = new Set([ARCHIVE_DIR, TEMPLATES_DIR, CONFIG_DIR, INDEX_DIR]);

/**
 * An engram `type` becomes a directory name (`{type}/{id}.md`). Constrain it
 * to a single filesystem-safe segment so API input can never traverse out of
 * `ENGRAM_ROOT` or collide with reserved directories.
 */
const TYPE_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function assertSafeType(type: string): void {
  if (!TYPE_SEGMENT_PATTERN.test(type) || WELL_KNOWN_DIRS.has(type) || type === 'engrams') {
    throw new ValidationError({
      message: `invalid engram type '${type}' — must be a short lowercase segment`,
    });
  }
}

/** Return a new array with duplicates removed, preserving first-seen order. */
function dedupe<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export interface CreateEngramInput {
  type: string;
  title: string;
  body?: string;
  scopes?: string[];
  tags?: string[];
  template?: string;
  customFields?: Record<string, unknown>;
  source?: EngramSource;
  links?: string[];
}

export interface UpdateEngramInput {
  title?: string;
  body?: string;
  scopes?: string[];
  tags?: string[];
  customFields?: Record<string, unknown>;
  status?: EngramStatus;
}

export interface ListEngramsOptions {
  type?: string;
  scopes?: string[];
  tags?: string[];
  ids?: string[];
  status?: EngramStatus;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: {
    field: 'created_at' | 'modified_at' | 'title';
    direction: 'asc' | 'desc';
  };
}

export interface ListEngramsResult {
  engrams: Engram[];
  total: number;
}

export interface EngramServiceOptions {
  /** Root of the engram directory, e.g. `/opt/pops/engrams`. */
  root: string;
  db: BetterSQLite3Database;
  templates: TemplateRegistry;
  /** Optional rule engine for auto-assigning scopes during create. */
  scopeRuleEngine?: ScopeRuleEngine;
  /** Override for deterministic tests. Defaults to `new Date()`. */
  now?: () => Date;
}

export class EngramService {
  private readonly root: string;
  private readonly db: BetterSQLite3Database;
  private readonly templates: TemplateRegistry;
  private readonly scopeRuleEngine: ScopeRuleEngine | undefined;
  private readonly now: () => Date;

  constructor(options: EngramServiceOptions) {
    this.root = options.root;
    this.db = options.db;
    this.templates = options.templates;
    this.scopeRuleEngine = options.scopeRuleEngine;
    this.now = options.now ?? (() => new Date());
  }

  create(input: CreateEngramInput): Engram {
    const scopes = input.scopes ?? [];
    const tags = input.tags ?? [];
    const source = input.source ?? 'manual';

    if (scopes.length === 0) {
      // A template may supply default_scopes — defer the min-1 check until after applyTemplate.
      if (!input.template && !this.scopeRuleEngine) {
        throw new ValidationError({ message: 'at least one scope is required' });
      }
    }

    let body = input.body ?? '';
    let customFields: Record<string, unknown> = input.customFields ?? {};
    let templateName: string | undefined = input.template;
    let mergedScopes = scopes;
    let type = input.type || 'capture';

    if (templateName) {
      const template = this.templates.get(templateName);
      if (!template) {
        console.warn(
          `[cerebrum] Template '${templateName}' not found — falling back to a 'capture' engram.`
        );
        templateName = undefined;
        // PRD-077 US-02: unknown template ⇒ capture-type engram, no scaffolding.
        type = 'capture';
      } else {
        const applied = applyTemplate({
          template,
          title: input.title,
          body: input.body,
          scopes,
          customFields,
        });
        body = applied.body;
        mergedScopes = applied.scopes;
        customFields = applied.customFields;
      }
    }

    // Tier 2: rule-based inference — only when no explicit scopes and no template supplied them.
    if (mergedScopes.length === 0 && this.scopeRuleEngine) {
      mergedScopes = this.scopeRuleEngine.inferScopes({
        source,
        type,
        tags,
        explicitScopes: [],
      });
    }

    if (mergedScopes.length === 0) {
      throw new ValidationError({ message: 'at least one scope is required' });
    }

    assertSafeType(type);
    const id = generateEngramId({
      title: input.title,
      now: this.now(),
      isTaken: (candidate) => this.isIdTaken(candidate, type),
    });

    const nowIso = this.now().toISOString();
    const frontmatter: EngramFrontmatter = {
      id,
      type,
      scopes: dedupe(mergedScopes),
      created: nowIso,
      modified: nowIso,
      source,
      status: 'active',
      ...(tags.length > 0 ? { tags: dedupe(tags) } : {}),
      ...(input.links && input.links.length > 0 ? { links: dedupe(input.links) } : {}),
      ...(templateName ? { template: templateName } : {}),
      ...customFields,
    };

    const fileContent = serializeEngram(frontmatter, body);
    const relPath = join(type, `${id}.md`);
    this.writeFileAtomic(relPath, fileContent);

    this.upsertIndex({
      id,
      filePath: relPath,
      frontmatter,
      body,
      customFields,
    });

    return this.loadEngram(id);
  }

  read(id: string): { engram: Engram; body: string } {
    const row = this.getIndexRow(id);
    const content = readFileSync(this.absolutePath(row.file_path), 'utf8');
    const { frontmatter, body } = parseEngramFile(content);
    return {
      engram: buildEngram(frontmatter, {
        filePath: row.file_path,
        title: row.title,
        contentHash: row.content_hash,
        wordCount: row.word_count,
        customFields: parseCustomFields(row.custom_fields),
      }),
      body,
    };
  }

  update(id: string, changes: UpdateEngramInput): Engram {
    const row = this.getIndexRow(id);
    const existingContent = readFileSync(this.absolutePath(row.file_path), 'utf8');
    const { frontmatter, body } = parseEngramFile(existingContent);

    if (changes.status && !canTransitionStatus(frontmatter.status, changes.status)) {
      throw new ValidationError({
        message: `cannot transition status from '${frontmatter.status}' to '${changes.status}'`,
      });
    }

    const nextBody = applyTitleChange(changes.body ?? body, changes.title);
    const customFields: Record<string, unknown> = {
      ...(row.custom_fields ? parseCustomFields(row.custom_fields) : {}),
      ...changes.customFields,
    };

    const nextFrontmatter: EngramFrontmatter = {
      ...frontmatter,
      ...customFields,
      modified: this.now().toISOString(),
      ...(changes.scopes ? { scopes: changes.scopes } : {}),
      ...(changes.tags ? { tags: changes.tags } : {}),
      ...(changes.status ? { status: changes.status } : {}),
    };

    if (!changes.tags && frontmatter.tags) nextFrontmatter.tags = frontmatter.tags;
    if (nextFrontmatter.tags && nextFrontmatter.tags.length === 0) delete nextFrontmatter.tags;

    const file = serializeEngram(nextFrontmatter, nextBody);
    this.writeFileAtomic(row.file_path, file);
    this.upsertIndex({
      id,
      filePath: row.file_path,
      frontmatter: nextFrontmatter,
      body: nextBody,
      customFields,
    });

    return this.loadEngram(id);
  }

  archive(id: string): Engram {
    const row = this.getIndexRow(id);
    const existingContent = readFileSync(this.absolutePath(row.file_path), 'utf8');
    const { frontmatter, body } = parseEngramFile(existingContent);

    if (frontmatter.status === 'archived') return this.loadEngram(id);

    const nextFrontmatter: EngramFrontmatter = {
      ...frontmatter,
      status: 'archived',
      modified: this.now().toISOString(),
    };
    const archivedPath = join(ARCHIVE_DIR, row.file_path);
    const archivedAbs = this.absolutePath(archivedPath);
    mkdirSync(dirname(archivedAbs), { recursive: true });

    const file = serializeEngram(nextFrontmatter, body);
    writeFileAtomic(archivedAbs, file);
    const sourceAbs = this.absolutePath(row.file_path);
    if (existsSync(sourceAbs)) unlinkSync(sourceAbs);

    const customFields = row.custom_fields ? parseCustomFields(row.custom_fields) : {};
    this.upsertIndex({
      id,
      filePath: archivedPath,
      frontmatter: nextFrontmatter,
      body,
      customFields,
    });

    return this.loadEngram(id);
  }

  link(sourceId: string, targetId: string): void {
    if (sourceId === targetId) {
      throw new ValidationError({ message: 'cannot link an engram to itself' });
    }
    const sourceRow = this.getIndexRow(sourceId);
    const targetRow = this.findIndexRow(targetId);

    this.mutateFrontmatter(sourceRow.id, (fm) => {
      const links = new Set(fm.links ?? []);
      links.add(targetId);
      return { ...fm, links: [...links], modified: this.now().toISOString() };
    });

    if (targetRow) {
      this.mutateFrontmatter(targetId, (fm) => {
        const links = new Set(fm.links ?? []);
        links.add(sourceId);
        return { ...fm, links: [...links], modified: this.now().toISOString() };
      });
    }

    this.db
      .insert(engramLinks)
      .values([
        { sourceId, targetId },
        ...(targetRow ? [{ sourceId: targetId, targetId: sourceId }] : []),
      ])
      .onConflictDoNothing()
      .run();
  }

  unlink(sourceId: string, targetId: string): void {
    const sourceRow = this.getIndexRow(sourceId);
    const targetRow = this.findIndexRow(targetId);

    this.mutateFrontmatter(sourceRow.id, (fm) => ({
      ...fm,
      links: (fm.links ?? []).filter((l) => l !== targetId),
      modified: this.now().toISOString(),
    }));

    if (targetRow) {
      this.mutateFrontmatter(targetId, (fm) => ({
        ...fm,
        links: (fm.links ?? []).filter((l) => l !== sourceId),
        modified: this.now().toISOString(),
      }));
    }

    this.db
      .delete(engramLinks)
      .where(
        sql`(${engramLinks.sourceId} = ${sourceId} AND ${engramLinks.targetId} = ${targetId}) OR (${engramLinks.sourceId} = ${targetId} AND ${engramLinks.targetId} = ${sourceId})`
      )
      .run();
  }

  list(opts: ListEngramsOptions = {}): ListEngramsResult {
    const conditions = [];
    if (opts.type) conditions.push(eq(engramIndex.type, opts.type));
    if (opts.status) conditions.push(eq(engramIndex.status, opts.status));
    if (opts.search) conditions.push(like(engramIndex.title, `%${opts.search}%`));
    if (opts.scopes && opts.scopes.length > 0) {
      conditions.push(
        inArray(
          engramIndex.id,
          this.db
            .select({ engramId: engramScopes.engramId })
            .from(engramScopes)
            .where(inArray(engramScopes.scope, opts.scopes))
        )
      );
    }
    if (opts.tags && opts.tags.length > 0) {
      conditions.push(
        inArray(
          engramIndex.id,
          this.db
            .select({ engramId: engramTags.engramId })
            .from(engramTags)
            .where(inArray(engramTags.tag, opts.tags))
        )
      );
    }
    if (opts.ids && opts.ids.length > 0) {
      conditions.push(inArray(engramIndex.id, opts.ids));
    }

    const where = conditions.length === 0 ? undefined : and(...conditions);
    const sortField = opts.sort?.field ?? 'modified_at';
    const sortDir = opts.sort?.direction ?? 'desc';
    const orderColumn =
      sortField === 'title'
        ? engramIndex.title
        : sortField === 'created_at'
          ? engramIndex.createdAt
          : engramIndex.modifiedAt;

    // When filtering by explicit IDs, use the ID count as the limit (all match or none).
    const limit = opts.ids && opts.limit === undefined ? opts.ids.length : (opts.limit ?? 50);
    const offset = opts.offset ?? 0;

    const rowsQuery = this.db.select().from(engramIndex).$dynamic();
    const rows = (where ? rowsQuery.where(where) : rowsQuery)
      .orderBy(sortDir === 'asc' ? orderColumn : sql`${orderColumn} desc`)
      .limit(limit)
      .offset(offset)
      .all();

    const totalQuery = this.db.select({ total: count() }).from(engramIndex).$dynamic();
    const [totalRow] = (where ? totalQuery.where(where) : totalQuery).all();

    return {
      engrams: this.hydrateEngrams(rows.map(indexRowFromDrizzle)),
      total: totalRow?.total ?? 0,
    };
  }

  /**
   * Batch-fetch scopes, tags, and links for a page of index rows.
   * Three queries total regardless of page size — avoids the N+1 of looking
   * each junction table up per-engram.
   */
  private hydrateEngrams(rows: IndexRow[]): Engram[] {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const scopesByEngram = bucket(
      this.db
        .select({ engramId: engramScopes.engramId, value: engramScopes.scope })
        .from(engramScopes)
        .where(inArray(engramScopes.engramId, ids))
        .all()
    );
    const tagsByEngram = bucket(
      this.db
        .select({ engramId: engramTags.engramId, value: engramTags.tag })
        .from(engramTags)
        .where(inArray(engramTags.engramId, ids))
        .all()
    );
    const linksByEngram = bucket(
      this.db
        .select({ engramId: engramLinks.sourceId, value: engramLinks.targetId })
        .from(engramLinks)
        .where(inArray(engramLinks.sourceId, ids))
        .all()
    );

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      scopes: scopesByEngram.get(row.id) ?? [],
      tags: tagsByEngram.get(row.id) ?? [],
      links: linksByEngram.get(row.id) ?? [],
      created: row.created_at,
      modified: row.modified_at,
      source: row.source as EngramSource,
      status: row.status as EngramStatus,
      template: row.template,
      title: row.title,
      filePath: row.file_path,
      contentHash: row.content_hash,
      wordCount: row.word_count,
      customFields: parseCustomFields(row.custom_fields),
    }));
  }

  reindex(): { indexed: number } {
    const files = this.listEngramFiles();
    const rowsToInsert: {
      row: typeof engramIndex.$inferInsert;
      scopes: string[];
      tags: string[];
      links: string[];
    }[] = [];
    for (const relPath of files) {
      const absPath = this.absolutePath(relPath);
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
          wordCount,
          customFields: Object.keys(customFields).length > 0 ? JSON.stringify(customFields) : null,
        },
        // Dedupe so a hand-edited file with a repeated scope/tag/link doesn't
        // blow up the rebuild with a UNIQUE constraint violation.
        scopes: dedupe(frontmatter.scopes),
        tags: dedupe(frontmatter.tags ?? []),
        links: dedupe(frontmatter.links ?? []),
      });
    }

    this.db.transaction((tx) => {
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

  private mutateFrontmatter(
    id: string,
    transform: (fm: EngramFrontmatter) => EngramFrontmatter
  ): void {
    const row = this.getIndexRow(id);
    const content = readFileSync(this.absolutePath(row.file_path), 'utf8');
    const { frontmatter, body } = parseEngramFile(content);
    const next = transform(frontmatter);
    const file = serializeEngram(next, body);
    this.writeFileAtomic(row.file_path, file);
    const customFields = row.custom_fields ? parseCustomFields(row.custom_fields) : {};
    this.upsertIndex({ id, filePath: row.file_path, frontmatter: next, body, customFields });
  }

  private isIdTaken(candidate: string, type: string): boolean {
    if (!ENGRAM_ID_PATTERN.test(candidate)) return false;
    const [row] = this.db
      .select({ id: engramIndex.id })
      .from(engramIndex)
      .where(eq(engramIndex.id, candidate))
      .all();
    if (row) return true;
    return existsSync(this.absolutePath(join(type, `${candidate}.md`)));
  }

  private upsertIndex(args: {
    id: string;
    filePath: string;
    frontmatter: EngramFrontmatter;
    body: string;
    customFields: Record<string, unknown>;
  }): void {
    const { id, filePath, frontmatter, body, customFields } = args;
    const title = deriveTitle(body);
    const contentHash = sha256(serializeEngram(frontmatter, body));
    const wordCount = countWords(body);

    this.db.transaction((tx) => {
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
          wordCount,
          customFields: Object.keys(customFields).length > 0 ? JSON.stringify(customFields) : null,
        })
        .run();

      // Dedupe defends against hand-edited frontmatter with repeats.
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

  private loadEngram(id: string): Engram {
    const row = this.getIndexRow(id);
    const [engram] = this.hydrateEngrams([row]);
    if (!engram) throw new NotFoundError('Engram', id);
    return engram;
  }

  private getIndexRow(id: string): IndexRow {
    const row = this.findIndexRow(id);
    if (!row) throw new NotFoundError('Engram', id);
    return row;
  }

  private findIndexRow(id: string): IndexRow | null {
    const [row] = this.db.select().from(engramIndex).where(eq(engramIndex.id, id)).all();
    return row ? indexRowFromDrizzle(row) : null;
  }

  private writeFileAtomic(relPath: string, contents: string): void {
    writeFileAtomic(this.absolutePath(relPath), contents);
  }

  private absolutePath(relPath: string): string {
    return join(this.root, relPath);
  }

  private listEngramFiles(): string[] {
    const result: string[] = [];
    const walk = (dir: string): void => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (dir === this.root && WELL_KNOWN_DIRS.has(entry.name)) continue;
          walk(join(dir, entry.name));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const rel = relative(this.root, join(dir, entry.name));
          result.push(rel.split(sep).join('/'));
        }
      }
    };
    if (!existsSync(this.root)) return [];
    walk(this.root);
    return result;
  }
}

type IndexRow = {
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
  word_count: number;
  custom_fields: string | null;
};

function indexRowFromDrizzle(row: typeof engramIndex.$inferSelect): IndexRow {
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
    word_count: row.wordCount,
    custom_fields: row.customFields,
  };
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Group `{ engramId, value }` rows into a map keyed by engramId. */
function bucket(rows: { engramId: string; value: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    const existing = out.get(row.engramId);
    if (existing) existing.push(row.value);
    else out.set(row.engramId, [row.value]);
  }
  return out;
}

function parseCustomFields(json: string | null): Record<string, unknown> {
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

function splitCustomFields(fm: EngramFrontmatter): {
  customFields: Record<string, unknown>;
} {
  const customFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(key)) customFields[key] = value;
  }
  return { customFields };
}

/**
 * Apply an updated title by rewriting the first H1 in the body, or prepending
 * one if none exists.
 */
function applyTitleChange(body: string, newTitle: string | undefined): string {
  if (!newTitle) return body;
  const lines = body.split('\n');
  const h1Index = lines.findIndex((line) => /^#\s+/.test(line.trim()));
  if (h1Index >= 0) {
    lines[h1Index] = `# ${newTitle}`;
    return lines.join('\n');
  }
  return `# ${newTitle}\n\n${body.trimStart()}`;
}

function writeFileAtomic(absPath: string, contents: string): void {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp.${randomUUID()}`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, absPath);
}
