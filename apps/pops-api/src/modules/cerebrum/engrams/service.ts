/**
 * Engram CRUD service — thin orchestrator.
 * All write operations use atomic file writes before index updates.
 * The filesystem is source of truth; the index is a regenerable cache.
 */
import { readFileSync } from 'node:fs';

import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { parseEngramFile, serializeEngram } from './file.js';
import { archiveEngram } from './handlers/archive-engram.js';
import { createEngram, type CreateEngramInput } from './handlers/create-engram.js';
import {
  absolutePath,
  applyTitleChange,
  parseCustomFields,
  writeFileAtomic,
} from './handlers/fs-helpers.js';
import { linkEngrams, unlinkEngrams } from './handlers/link-helpers.js';
import {
  hydrateEngrams,
  listEngrams,
  type ListEngramsOptions,
  type ListEngramsResult,
} from './handlers/list-engrams.js';
import { reindexEngrams } from './handlers/rebuild-index.js';
import { getIndexRow, upsertIndex } from './handlers/upsert-index.js';
import { canTransitionStatus, type EngramFrontmatter, type EngramStatus } from './schema.js';
import { buildEngram, type Engram } from './types.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { TemplateRegistry } from '../templates/registry.js';
import type { ScopeRuleEngine } from './scope-rules.js';

export type { CreateEngramInput } from './handlers/create-engram.js';
export type { ListEngramsOptions, ListEngramsResult } from './handlers/list-engrams.js';

export interface UpdateEngramInput {
  title?: string;
  body?: string;
  scopes?: string[];
  tags?: string[];
  customFields?: Record<string, unknown>;
  status?: EngramStatus;
}

export interface EngramServiceOptions {
  root: string;
  db: BetterSQLite3Database;
  templates: TemplateRegistry;
  scopeRuleEngine?: ScopeRuleEngine;
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
    const id = createEngram(
      {
        root: this.root,
        db: this.db,
        templates: this.templates,
        scopeRuleEngine: this.scopeRuleEngine,
        now: this.now,
      },
      input
    );
    return this.loadEngram(id);
  }

  read(id: string): { engram: Engram; body: string } {
    const row = getIndexRow(this.db, id);
    const content = readFileSync(absolutePath(this.root, row.file_path), 'utf8');
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
    const row = getIndexRow(this.db, id);
    const existingContent = readFileSync(absolutePath(this.root, row.file_path), 'utf8');
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

    writeFileAtomic(
      absolutePath(this.root, row.file_path),
      serializeEngram(nextFrontmatter, nextBody)
    );
    upsertIndex(this.db, {
      id,
      filePath: row.file_path,
      frontmatter: nextFrontmatter,
      body: nextBody,
      customFields,
    });

    return this.loadEngram(id);
  }

  archive(id: string): Engram {
    archiveEngram({ root: this.root, db: this.db, now: this.now }, id);
    return this.loadEngram(id);
  }

  link(sourceId: string, targetId: string): void {
    linkEngrams({ root: this.root, db: this.db, now: this.now }, sourceId, targetId);
  }

  unlink(sourceId: string, targetId: string): void {
    unlinkEngrams({ root: this.root, db: this.db, now: this.now }, sourceId, targetId);
  }

  list(opts: ListEngramsOptions = {}): ListEngramsResult {
    return listEngrams(this.db, opts);
  }

  reindex(): { indexed: number } {
    return reindexEngrams(this.db, this.root);
  }

  private loadEngram(id: string): Engram {
    const row = getIndexRow(this.db, id);
    const [engram] = hydrateEngrams(this.db, [row]);
    if (!engram) throw new NotFoundError('Engram', id);
    return engram;
  }
}
