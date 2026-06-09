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
 * `compileRecipeVersion` lives in `@pops/app-food` (frontend-bound
 * package, depends on @pops/api-client) — calling it here would close a
 * `pops-api → @pops/app-food → @pops/api-client → @pops/api` package
 * cycle. PRD-119's tRPC handler will own that call site.
 */
import { eq } from 'drizzle-orm';

import { type FoodDb, ingestSources, recipesService } from '@pops/app-food-db';

import type { IngestJobResult } from '@pops/food-contracts';

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
  db.update(ingestSources)
    .set({
      extractedJson: JSON.stringify(result.meta),
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    })
    .where(eq(ingestSources.id, sourceId))
    .run();
  return { ok: false, reason: result.errorCode };
}

export function applyWorkerComplete(
  db: FoodDb,
  sourceId: number,
  result: IngestJobResult
): WorkerCompleteOutcome {
  if (result.ok) return applySuccess(db, sourceId, result);
  return applyFailure(db, sourceId, result);
}
