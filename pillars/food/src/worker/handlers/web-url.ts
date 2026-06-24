/**
 * Web URL → JSON-LD → DSL handler
 * (`pillars/food/docs/prds/web-jsonld`).
 *
 * The fast path: fetch the page, look for a schema.org Recipe JSON-LD
 * block, map it to the DSL deterministically. When JSON-LD is missing
 * or malformed, this handler currently returns a `JsonLdMissing` failure
 * so the dispatch shell makes the absence visible — the LLM fallback in
 * `web-llm.ts` (`pillars/food/docs/prds/web-llm-fallback`) will replace
 * that branch once wired.
 *
 * No LLM call lives here; no `ai_inference_log` rows are written.
 */
import { extractRecipeJsonLd, type RecipeJsonLd } from './web/extract-json-ld.js';
import { fetchHtml, type FetchHtmlOptions, type FetchHtmlResult } from './web/fetch-html.js';
import { mapJsonLdToDsl } from './web/map-to-dsl.js';

import type { IngestJobResult, IngestMeta } from '../../contract/queue/index.js';
import type { IngestHandler } from './types.js';

export const WEB_JSONLD_EXTRACTOR_VERSION = 'web-jsonld@1';

export interface WebUrlIngestDeps {
  fetchHtmlImpl?: typeof fetchHtml;
  fetchHtmlOptions?: FetchHtmlOptions;
  /** Slugs that exist in `slug_registry`; used to suffix recipe-slug collisions. */
  reservedSlugs?: ReadonlySet<string>;
}

interface WebData {
  kind: 'url-web';
  sourceId: number;
  url: string;
}

interface CancelCtx {
  isCancelled: () => boolean | Promise<boolean>;
}

export const runWebUrlIngest: IngestHandler<'url-web'> = async (data, ctx) => {
  return runWebUrlIngestWith(data, ctx, {});
};

export async function runWebUrlIngestWith(
  data: WebData,
  ctx: CancelCtx,
  deps: WebUrlIngestDeps
): Promise<IngestJobResult> {
  const meta: IngestMeta = { extractor_version: WEB_JSONLD_EXTRACTOR_VERSION, stages: {} };
  if (await ctx.isCancelled()) return cancelled(meta);

  const fetched = await runFetchStage(data.url, deps, meta);
  if (!fetched.ok) {
    return { ok: false, errorCode: fetched.errorCode, errorMessage: fetched.errorMessage, meta };
  }
  if (await ctx.isCancelled()) return cancelled(meta);

  const extraction = runExtractStage(fetched.html, meta);
  if (extraction.tag === 'error') {
    return { ok: false, errorCode: 'JsonLdParseError', errorMessage: extraction.message, meta };
  }
  if (extraction.tag === 'missing') {
    return {
      ok: false,
      errorCode: 'JsonLdMissing',
      errorMessage: 'Page has no schema.org Recipe JSON-LD; LLM fallback not yet wired.',
      meta,
    };
  }
  if (await ctx.isCancelled()) return cancelled(meta);

  return runMappingStage(extraction.recipe, deps, meta);
}

async function runFetchStage(
  url: string,
  deps: WebUrlIngestDeps,
  meta: IngestMeta
): Promise<FetchHtmlResult> {
  const fetchImpl = deps.fetchHtmlImpl ?? fetchHtml;
  const result = await fetchImpl(url, deps.fetchHtmlOptions ?? {});
  meta.stages['fetch'] = result.ok
    ? {
        ok: true,
        duration_ms: result.durationMs,
        status: result.status,
        final_url: result.finalUrl,
        bytes: result.bytes,
      }
    : {
        ok: false,
        duration_ms: result.durationMs,
        status: result.status,
        final_url: result.finalUrl,
        reason: result.errorMessage,
      };
  return result;
}

type ExtractStageResult =
  | { tag: 'ok'; recipe: RecipeJsonLd }
  | { tag: 'missing' }
  | { tag: 'error'; message: string };

function runExtractStage(html: string, meta: IngestMeta): ExtractStageResult {
  const start = Date.now();
  try {
    const recipe = extractRecipeJsonLd(html);
    if (recipe === null) {
      meta.stages['jsonld_extract'] = {
        ok: false,
        duration_ms: Date.now() - start,
        reason: 'no Recipe JSON-LD node found',
      };
      return { tag: 'missing' };
    }
    meta.stages['jsonld_extract'] = {
      ok: true,
      duration_ms: Date.now() - start,
      schema_type: 'Recipe',
    };
    return { tag: 'ok', recipe };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    meta.stages['jsonld_extract'] = {
      ok: false,
      duration_ms: Date.now() - start,
      reason: message,
    };
    return { tag: 'error', message };
  }
}

function runMappingStage(
  recipe: RecipeJsonLd,
  deps: WebUrlIngestDeps,
  meta: IngestMeta
): IngestJobResult {
  const start = Date.now();
  const mapped = mapJsonLdToDsl(recipe, { reservedSlugs: deps.reservedSlugs });
  meta.stages['mapping'] = {
    ok: true,
    duration_ms: Date.now() - start,
    ingredients: mapped.stats.ingredients,
    steps: mapped.stats.steps,
    tags: mapped.stats.tags,
  };
  return { ok: true, dsl: mapped.dsl, meta };
}

function cancelled(meta: IngestMeta): IngestJobResult {
  return {
    ok: false,
    errorCode: 'Cancelled',
    errorMessage: 'job cancelled by orchestrator',
    meta,
  };
}
