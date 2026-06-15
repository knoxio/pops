import { buildWebLlmDsl } from './web-llm-dsl.js';
/**
 * PRD-128 — Web URL LLM-fallback handler.
 *
 * PRD-127 owns the JSON-LD primary path and the `url-web` dispatch
 * stub at `handlers/web-url.ts`; this module ships `processWithLlm`
 * which 127 will plug in as the JSON-LD-miss fallback once both PRDs
 * land. The post-merge wiring is a single-line dispatcher edit + a
 * helper-import dedup; both are tracked in the roadmap claim.
 */
import { extractWithClaudeWebLlm } from './web-llm-extract.js';
import { extractReadable } from './web-llm-readability.js';

import type { IngestJobData, IngestJobResult, IngestMeta } from '../../contract/queue/index.js';
import type { AnthropicLike } from '../ai/web-llm-anthropic.js';
import type { CallClaudeLogPayload } from '../ai/web-llm-log.js';
import type { HandlerContext } from './types.js';
import type { WebLlmExtractFailure, WebLlmExtractSuccess } from './web-llm-extract.js';
import type { ReadableArticle } from './web-llm-readability.js';

export const WEB_LLM_EXTRACTOR_VERSION = 'pops-worker-food/web-llm@0.1.0';

const NEVER_CANCELLED: HandlerContext = { isCancelled: () => false };

export interface ProcessWithLlmOptions {
  /** Cancellation context; defaults to a never-cancelled shim. */
  ctx?: HandlerContext;
  /** Test seam — replaces the SDK call. */
  client?: AnthropicLike;
  /** Test seam — observes the inference-log payload. */
  onLog?: (payload: CallClaudeLogPayload) => void;
  /** Test seam — overrides the env-derived model. */
  model?: string;
}

type WebUrlJobData = Extract<IngestJobData, { kind: 'url-web' }>;

function cancelledResult(): IngestJobResult {
  return {
    ok: false,
    errorCode: 'Cancelled',
    errorMessage: 'job cancelled before completion',
    meta: { extractor_version: WEB_LLM_EXTRACTOR_VERSION, stages: {} },
  };
}

function failure(errorCode: string, errorMessage: string, meta: IngestMeta): IngestJobResult {
  return { ok: false, errorCode, errorMessage, meta };
}

function recordReadabilityStage(
  meta: IngestMeta,
  article: ReadableArticle | null,
  startedAt: number
): void {
  meta.stages['readability'] =
    article == null
      ? { ok: false, reason: 'no-extractable-content', duration_ms: Date.now() - startedAt }
      : {
          ok: true,
          duration_ms: Date.now() - startedAt,
          text_length: article.textLength,
          truncated: article.truncated,
          title: article.title,
        };
}

function recordExtractStage(
  meta: IngestMeta,
  llmResult: WebLlmExtractSuccess | WebLlmExtractFailure
): void {
  meta.stages['llm_extract'] = llmResult.ok
    ? llmExtractSuccessStage(llmResult)
    : llmExtractFailureStage(llmResult);
  meta.llm_raw_output = llmResult.raw;
  if (llmResult.ok) meta.total_cost_usd = llmResult.costUsd;
}

/**
 * Reads the already-fetched HTML (PRD-127 owns the fetch step + share
 * of `fetchHtml`), runs readability → Claude → DSL, returns the final
 * `IngestJobResult`. `finalUrl` is the post-redirect URL the dispatcher
 * captured during fetch; passed through to `extractReadable` so
 * relative links resolve.
 */
export async function processWithLlm(
  html: string,
  data: WebUrlJobData,
  finalUrl: string,
  opts: ProcessWithLlmOptions = {}
): Promise<IngestJobResult> {
  const ctx = opts.ctx ?? NEVER_CANCELLED;
  const meta: IngestMeta = { extractor_version: WEB_LLM_EXTRACTOR_VERSION, stages: {} };

  if (await ctx.isCancelled()) return cancelledResult();

  const readableStart = Date.now();
  const article = extractReadable(html, finalUrl);
  recordReadabilityStage(meta, article, readableStart);
  if (article == null) {
    return failure('NoExtractableContent', 'readability returned no usable article body', meta);
  }

  if (await ctx.isCancelled()) return cancelledResult();

  const llmResult = await extractWithClaudeWebLlm({
    title: article.title,
    bodyText: article.textContent,
    url: finalUrl,
    sourceId: data.sourceId,
    client: opts.client,
    onLog: opts.onLog,
    model: opts.model,
  });
  recordExtractStage(meta, llmResult);
  if (!llmResult.ok) {
    return failure('LlmExtractFailed', `${llmResult.reason}: ${llmResult.message}`, meta);
  }

  if (await ctx.isCancelled()) return cancelledResult();
  return finaliseDsl(llmResult, finalUrl, meta);
}

function finaliseDsl(
  llmResult: WebLlmExtractSuccess,
  finalUrl: string,
  meta: IngestMeta
): IngestJobResult {
  const dslStart = Date.now();
  const built = buildWebLlmDsl(llmResult.parsed, { source: 'url-web', url: finalUrl });
  meta.stages['dsl_build'] = {
    ok: true,
    duration_ms: Date.now() - dslStart,
    slug: built.slug,
    prep_fallback_count: built.prepFallbackCount,
  };
  const partialReason =
    llmResult.parsed.ingredients.length === 0 || llmResult.parsed.steps.length === 0
      ? 'empty-extraction'
      : undefined;
  return partialReason != null
    ? { ok: true, dsl: built.dsl, meta, partialReason }
    : { ok: true, dsl: built.dsl, meta };
}

function llmExtractSuccessStage(r: WebLlmExtractSuccess): Record<string, unknown> {
  return {
    ok: true,
    duration_ms: r.latencyMs,
    model: r.model,
    prompt_version: r.promptVersion,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    cost_usd: r.costUsd,
  };
}

function llmExtractFailureStage(r: WebLlmExtractFailure): Record<string, unknown> {
  return {
    ok: false,
    duration_ms: r.latencyMs,
    model: r.model,
    prompt_version: r.promptVersion,
    reason: r.reason,
    message: r.message,
  };
}
