/**
 * Engram CRUD service for the cerebrum pillar.
 *
 * The filesystem is the source of truth; the SQLite index is a regenerable
 * cache. All write operations use atomic file writes before index updates,
 * and the create path wraps the index insert + file write in a single
 * transaction so a failure on either side leaves no orphan.
 *
 * Reads (`list`, `read`, `exists`) resolve through the pillar data-access
 * layer (`engramsService` in `../../../db/index.js`); writes route through the
 * FS-coupled handlers under `./handlers/*`. The on-disk Markdown format, the
 * template registry, and the YAML engine all live in this module — the db
 * package stays pure data-access.
 */
import { readFileSync } from 'node:fs';

import { engramsService, type CerebrumDb } from '../../../db/index.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { parseEngramFile, serializeEngram } from './file.js';
import { archiveEngram } from './handlers/archive-engram.js';
import { changeEngramType } from './handlers/change-type.js';
import {
  createEngram,
  type CreateEngramInput,
  type ScopeInferenceEngine,
} from './handlers/create-engram.js';
import { deleteEngram, type DeleteResult } from './handlers/delete-engram.js';
import {
  absolutePath,
  applyTitleChange,
  parseCustomFields,
  writeFileAtomic,
} from './handlers/fs-helpers.js';
import { linkEngrams, unlinkEngrams } from './handlers/link-helpers.js';
import {
  hydrateEngrams,
  type ListEngramsOptions,
  type ListEngramsResult,
} from './handlers/list-engrams.js';
import { reindexEngrams } from './handlers/rebuild-index.js';
import { restoreEngram, type RestoreResult } from './handlers/restore-engram.js';
import { getIndexRow, upsertIndex } from './handlers/upsert-index.js';
import { canTransitionStatus, type EngramFrontmatter, type EngramStatus } from './schema.js';
import { buildEngram, type Engram } from './types.js';

import type { TemplateRegistry } from '../templates/registry.js';

export type { CreateEngramInput } from './handlers/create-engram.js';
export type { ListEngramsOptions, ListEngramsResult } from './handlers/list-engrams.js';

export interface UpdateEngramInput {
  title?: string;
  body?: string;
  scopes?: string[];
  tags?: string[];
  customFields?: Record<string, unknown>;
  status?: EngramStatus;
  /**
   * Template name to assign in frontmatter. `type` is not mutable through this
   * method — use `changeType` for that since it requires a file move.
   */
  template?: string;
}

export interface EngramServiceOptions {
  root: string;
  db: CerebrumDb;
  templates: TemplateRegistry;
  scopeRuleEngine?: ScopeInferenceEngine;
  now?: () => Date;
}

export class EngramService {
  private readonly root: string;
  private readonly db: CerebrumDb;
  private readonly templates: TemplateRegistry;
  private readonly scopeRuleEngine: ScopeInferenceEngine | undefined;
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
    const row = engramsService.findIndexRow(this.db, id);
    if (!row) throw new NotFoundError('Engram', id);
    const content = readFileSync(absolutePath(this.root, row.filePath), 'utf8');
    const { frontmatter, body } = parseEngramFile(content);
    return {
      engram: buildEngram(frontmatter, {
        filePath: row.filePath,
        title: row.title,
        contentHash: row.contentHash,
        wordCount: row.wordCount,
        customFields: engramsService.parseCustomFields(row.customFields),
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

    const nextFrontmatter = mergeUpdateIntoFrontmatter(
      frontmatter,
      customFields,
      changes,
      this.now()
    );

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

  /**
   * Move an archived engram back to `{type}/{id}.md` with `status: active`.
   * Inverse of `archive()`. Idempotent — restoring an already-active engram is
   * a no-op.
   */
  restore(id: string): { engram: Engram; result: RestoreResult } {
    const result = restoreEngram({ root: this.root, db: this.db, now: this.now }, id);
    return { engram: this.loadEngram(id), result };
  }

  /**
   * Hard-delete an engram: removes the file, index row, outbound link rows
   * (cascade), and strips inbound link references from other engrams'
   * frontmatter. Idempotent — deleting a non-existent engram is a no-op.
   */
  hardDelete(id: string): DeleteResult {
    return deleteEngram({ root: this.root, db: this.db, now: this.now }, id);
  }

  /** True iff `id` is present in the engram index. */
  exists(id: string): boolean {
    return engramsService.existsEngram(this.db, id);
  }

  /**
   * Move an engram to a different type folder. The engram id is preserved, so
   * existing links remain valid.
   */
  changeType(id: string, newType: string): Engram {
    changeEngramType({ root: this.root, db: this.db, now: this.now }, id, newType);
    return this.loadEngram(id);
  }

  link(sourceId: string, targetId: string): void {
    linkEngrams({ root: this.root, db: this.db, now: this.now }, sourceId, targetId);
  }

  unlink(sourceId: string, targetId: string): void {
    unlinkEngrams({ root: this.root, db: this.db, now: this.now }, sourceId, targetId);
  }

  list(opts: ListEngramsOptions = {}): ListEngramsResult {
    return engramsService.listEngrams(this.db, opts);
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

/**
 * Merge an `UpdateEngramInput` into the existing frontmatter. Extracted from
 * `EngramService.update` to keep that method's cyclomatic complexity within
 * the project's lint budget.
 */
function mergeUpdateIntoFrontmatter(
  frontmatter: EngramFrontmatter,
  customFields: Record<string, unknown>,
  changes: UpdateEngramInput,
  now: Date
): EngramFrontmatter {
  const next: EngramFrontmatter = {
    ...frontmatter,
    ...customFields,
    modified: now.toISOString(),
    ...(changes.scopes ? { scopes: changes.scopes } : {}),
    ...(changes.tags ? { tags: changes.tags } : {}),
    ...(changes.status ? { status: changes.status } : {}),
    ...(changes.template ? { template: changes.template } : {}),
  };
  if (!changes.tags && frontmatter.tags) next.tags = frontmatter.tags;
  if (next.tags && next.tags.length === 0) delete next.tags;
  return next;
}
