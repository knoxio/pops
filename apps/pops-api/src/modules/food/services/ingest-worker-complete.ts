/**
 * PRD-125 — server-side `food.ingest.workerComplete` execution.
 *
 * Two outcomes:
 *
 *   - `ok: true` — creates a draft recipe + first version via
 *     `recipesService.createRecipe` (from `@pops/app-food-db`) and
 *     updates the `ingest_sources` row in ONE transaction. The version
 *     is left uncompiled; PRD-119's promote flow runs the compile
 *     pipeline lazily when the user approves the draft from the inbox.
 *   - `ok: false` — writes the `meta` rollup + `error_code` + `error_message`
 *     to `ingest_sources` (PRD-138 amendment columns). Returns
 *     `{ ok: false, reason }` to the worker.
 *
 * Each branch is idempotent. BullMQ retries the callback on transient
 * network errors, so a second `ok:true` call sees the previously-set
 * `draft_recipe_id` and returns it instead of re-inserting the slug.
 *
 * `compileRecipeVersion` lives in `@pops/app-food` (frontend-bound
 * package, depends on @pops/api-client) — calling it here would close a
 * `pops-api → @pops/app-food → @pops/api-client → @pops/api` package
 * cycle. PRD-119's tRPC handler will own that call site.
 */
import { eq } from 'drizzle-orm';

import { type FoodDb, ingestSources, recipesService } from '@pops/app-food-db';

import type { IngestJobResult } from '@pops/food/queue';

const INGEST_RECIPE_SLUG_PREFIX = 'ingest-source-';
/** Lightweight match against `@recipe(... title="...")` — the DSL grammar in
 *  `packages/app-food/src/dsl/parse-recipe.ts` declares `title` as a named
 *  arg inside `@recipe(...)`. We deliberately don't call the full parser to
 *  avoid depending on `@pops/app-food` (which would close the cycle through
 *  @pops/api-client); the regex is permissive enough for any author-written
 *  `title="..."` inside the `@recipe(...)` header. Falls back to a generic
 *  title when the worker emits a body the parser would reject — the inbox
 *  surfaces the literal DSL anyway. */
const TITLE_RE = /@recipe\s*\([^)]*\btitle\s*=\s*"([^"]+)"/;

function deriveSlug(sourceId: number): string {
  return `${INGEST_RECIPE_SLUG_PREFIX}${sourceId}`;
}

function deriveTitle(dsl: string): string {
  const match = TITLE_RE.exec(dsl);
  const title = match?.[1]?.trim();
  if (title !== undefined && title.length > 0) return title;
  return 'Untitled ingested recipe';
}

export class WorkerCompleteSourceNotFound extends Error {
  constructor(sourceId: number) {
    super(`ingest_sources #${sourceId} not found`);
    this.name = 'WorkerCompleteSourceNotFound';
  }
}

interface ExistingSourceRow {
  id: number;
  draftRecipeId: number | null;
}

/** Reads the row once at the top of the transaction so the worker sees a
 *  clear failure when `sourceId` doesn't exist (or was double-evicted)
 *  rather than a silent no-op UPDATE. */
function loadSourceRow(tx: FoodDb, sourceId: number): ExistingSourceRow {
  const rows = tx
    .select({
      id: ingestSources.id,
      draftRecipeId: ingestSources.draftRecipeId,
    })
    .from(ingestSources)
    .where(eq(ingestSources.id, sourceId))
    .all();
  const row = rows[0];
  if (row === undefined) throw new WorkerCompleteSourceNotFound(sourceId);
  return row;
}

export interface WorkerCompleteSuccessResult {
  ok: true;
  draftRecipeId: number;
  compileStatus: 'compiled' | 'failed' | 'uncompiled';
}

export interface WorkerCompleteFailureResult {
  ok: false;
  reason: string;
}

export type WorkerCompleteOutcome = WorkerCompleteSuccessResult | WorkerCompleteFailureResult;

function applySuccess(
  db: FoodDb,
  sourceId: number,
  result: Extract<IngestJobResult, { ok: true }>
): WorkerCompleteSuccessResult {
  return db.transaction((tx): WorkerCompleteSuccessResult => {
    const existing = loadSourceRow(tx, sourceId);
    // Idempotency — re-running `ok: true` after the previous run already
    // created the draft must return the existing recipe rather than
    // attempt a duplicate `slug_registry` insert (which would throw on
    // unique constraint).
    if (existing.draftRecipeId !== null) {
      return {
        ok: true,
        draftRecipeId: existing.draftRecipeId,
        compileStatus: 'uncompiled',
      };
    }
    const created = recipesService.createRecipe(tx, {
      slug: deriveSlug(sourceId),
      firstVersion: {
        title: deriveTitle(result.dsl),
        bodyDsl: result.dsl,
        sourceId,
      },
    });
    // Persist `partialReason` nested inside the meta blob so
    // `extractPartialReason` (status / list) can recover it after BullMQ
    // TTL expiry. The IngestMeta envelope is permissive — handler PRDs
    // 127–132 own the `stages` payload; this field is the only one the
    // producer side needs to surface to the inbox UI.
    const persistedMeta =
      result.partialReason === undefined
        ? result.meta
        : { ...result.meta, partialReason: result.partialReason };
    tx.update(ingestSources)
      .set({
        extractedJson: JSON.stringify(persistedMeta),
        draftRecipeId: created.recipe.id,
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(ingestSources.id, sourceId))
      .run();
    return { ok: true, draftRecipeId: created.recipe.id, compileStatus: 'uncompiled' };
  });
}

function applyFailure(
  db: FoodDb,
  sourceId: number,
  result: Extract<IngestJobResult, { ok: false }>
): WorkerCompleteFailureResult {
  return db.transaction((tx): WorkerCompleteFailureResult => {
    // Verify the row exists before the UPDATE — Drizzle's `.run()` would
    // silently affect zero rows otherwise, and the worker would see a
    // spurious "failure recorded" response.
    loadSourceRow(tx, sourceId);
    tx.update(ingestSources)
      .set({
        extractedJson: JSON.stringify(result.meta),
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      })
      .where(eq(ingestSources.id, sourceId))
      .run();
    return { ok: false, reason: result.errorCode };
  });
}

export function applyWorkerComplete(
  db: FoodDb,
  sourceId: number,
  result: IngestJobResult
): WorkerCompleteOutcome {
  if (result.ok) return applySuccess(db, sourceId, result);
  return applyFailure(db, sourceId, result);
}
