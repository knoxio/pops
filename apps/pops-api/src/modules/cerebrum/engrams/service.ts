/**
 * Engram CRUD service — read/write split during the PRD-179 cutover.
 *
 * The filesystem is source of truth; the index is a regenerable cache.
 * All write operations use atomic file writes before index updates.
 *
 * Read/write split during the migration window (PRD-179 PR 2):
 *  - Pure user-facing reads — `list`, `read` — are routed through
 *    `readDb` (a `CerebrumDb` handle, wired to `getCerebrumDrizzle()`
 *    in `instance.ts`) and forwarded to the `@pops/cerebrum-db`
 *    `engramsService.{listEngrams,findIndexRow}` namespace. These are
 *    the seam called out by PRD-179 PR 2.
 *  - `exists` checks `readDb` first then falls back to `db` (the write
 *    store). Glia revert calls `exists` to gate `restore`/`unlink`
 *    writes, so a row newly created since boot — present only in
 *    `pops.db` — must still report `true`. Drop the fallback once
 *    PRD-179 US-03 collapses writes onto `cerebrum.db`.
 *  - Every write path — `create`, `update`, `archive`, `restore`,
 *    `changeType`, `link`, `unlink`, `hardDelete`, `reindex` — and any
 *    read-after-write hop (the private `loadEngram` helper used to
 *    rehydrate the row we just wrote) still goes through `db` (the
 *    shared `pops.db` handle). Read-after-write consistency lives on
 *    that same store. PRD-179 US-03 flips the writes too, at which
 *    point `db` collapses into `readDb`.
 *
 * Cross-store consistency relies on `backfillCerebrumFromShared()` in
 * `apps/pops-api/src/db/backfill-cerebrum-from-shared.ts`: a one-way,
 * boot-time copy from `pops.db` -> `cerebrum.db` that idempotently
 * fills missing rows on `engram_index` + its three many-to-many
 * auxiliaries. Between boots, newly-written engrams live only in
 * `pops.db` and won't appear in `list`/`read`/`exists` results from
 * `readDb` until the next deploy reruns the backfill. Read-after-write
 * is preserved within the same process because `loadEngram` reads from
 * the write store. This is the same trade-off taken by the watch-history
 * (PRD-168 PR 2) and movies (PRD-165 PR 3) cutovers.
 *
 * Filesystem markdown writes, the template registry, and the scope-rule
 * engine stay in pops-api — `@pops/cerebrum-db` is pure data-access.
 * `EngramServiceOptions.readDb` is optional so the existing in-memory
 * test rigs (which inject a single SQLite handle for both stores) keep
 * working without churn; when omitted it falls back to `db`.
 */
import { readFileSync } from 'node:fs';

import { engramsService, type CerebrumDb } from '@pops/cerebrum-db';

import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { parseEngramFile, serializeEngram } from './file.js';
import { archiveEngram } from './handlers/archive-engram.js';
import { changeEngramType } from './handlers/change-type.js';
import { createEngram, type CreateEngramInput } from './handlers/create-engram.js';
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
import { findIndexRow, getIndexRow, upsertIndex } from './handlers/upsert-index.js';
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
  /**
   * Template name to assign in frontmatter. Used by the async classification
   * worker (PRD-081 US-03) to set a template after classification. `type` is
   * not mutable through this method — use `changeType` for that since it
   * requires a file move.
   */
  template?: string;
}

export interface EngramServiceOptions {
  root: string;
  /**
   * Write handle — the shared `pops.db` drizzle wrapper. All write paths
   * and read-after-write hops route through this handle until PRD-179
   * US-03 flips the writes too.
   */
  db: BetterSQLite3Database;
  /**
   * Read handle — the cerebrum pillar's `cerebrum.db` drizzle wrapper.
   * Pure user-facing reads (`list`, `read`, `exists`) forward through
   * `@pops/cerebrum-db`'s `engramsService` against this handle. Defaults
   * to `db` so test rigs that inject a single in-memory SQLite keep
   * working without churn.
   */
  readDb?: CerebrumDb;
  templates: TemplateRegistry;
  scopeRuleEngine?: ScopeRuleEngine;
  now?: () => Date;
}

export class EngramService {
  private readonly root: string;
  private readonly db: BetterSQLite3Database;
  private readonly readDb: CerebrumDb;
  private readonly templates: TemplateRegistry;
  private readonly scopeRuleEngine: ScopeRuleEngine | undefined;
  private readonly now: () => Date;

  constructor(options: EngramServiceOptions) {
    this.root = options.root;
    this.db = options.db;
    this.readDb = options.readDb ?? options.db;
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
    const row = engramsService.findIndexRow(this.readDb, id);
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
   * a no-op. Used by Glia prune/consolidate revert (PRD-086 US-04).
   */
  restore(id: string): { engram: Engram; result: RestoreResult } {
    const result = restoreEngram({ root: this.root, db: this.db, now: this.now }, id);
    return { engram: this.loadEngram(id), result };
  }

  /**
   * Hard-delete an engram: removes the file, index row, outbound link rows
   * (cascade), and strips inbound link references from other engrams'
   * frontmatter. Used by consolidate revert to remove the merged engram.
   * Idempotent — deleting a non-existent engram is a no-op.
   */
  hardDelete(id: string): DeleteResult {
    return deleteEngram({ root: this.root, db: this.db, now: this.now }, id);
  }

  /**
   * True iff `id` is present in the engram index.
   *
   * Consults the cerebrum read store first; falls back to the shared write
   * store (`pops.db`) when missing. Write-context callers (glia revert in
   * particular — see `../glia/revert-operations.ts`) check existence before
   * issuing `restore` / `unlink` mutations on the write store. A row newly
   * created since boot lives only in `pops.db` until the next backfill, so
   * a `readDb`-only check would produce false negatives and silently skip
   * the restore. The fallback keeps the TOCTOU window closed during the
   * cutover; once PRD-179 US-03 collapses writes onto `cerebrum.db`, the
   * second hop becomes redundant and can be dropped.
   */
  exists(id: string): boolean {
    if (engramsService.existsEngram(this.readDb, id)) return true;
    return findIndexRow(this.db, id) !== null;
  }

  /**
   * Move an engram to a different type folder. Used by the curation worker
   * (PRD-081 US-03 AC #6) when classification graduates a capture into its
   * classified type. The engram id is preserved, so existing links remain
   * valid.
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
    return engramsService.listEngrams(this.readDb, opts);
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
