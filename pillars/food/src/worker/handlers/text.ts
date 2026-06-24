import { PROMPT_VERSION_TEXT } from '../prompts/text.js';
import { buildDsl } from './build-dsl.js';
import { extractWithClaudeText, getTextModel } from './extract-with-claude.js';

import type {
  IngestJobResult,
  IngestMeta,
  IngestStageRecord,
  PartialReason,
} from '../../contract/queue/index.js';
import type { TextExtractFailure, TextExtractSuccess } from './extract-with-claude.js';
import type { IngestHandler } from './types.js';

export {
  __setTextIngestClientForTests,
  extractWithClaudeText,
  type TextExtractInput,
  type TextExtractResult,
} from './extract-with-claude.js';

const MIN_BODY_LENGTH = 10;
const MAX_BODY_LENGTH = 20_000;
const EXTRACTOR_VERSION = 'pops-worker-food/text@0.1.0';

function buildBaseMeta(stages: Record<string, IngestStageRecord>): IngestMeta {
  return { extractor_version: EXTRACTOR_VERSION, stages };
}

function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function emptyTextResult(length: number): IngestJobResult {
  return {
    ok: false,
    errorCode: 'EmptyText',
    errorMessage: `Body must be at least ${MIN_BODY_LENGTH} characters after trimming.`,
    meta: buildBaseMeta({ input_validate: { ok: false, length, reason: 'below-min' } }),
  };
}

function cancelledResult(length: number, truncated: boolean): IngestJobResult {
  return {
    ok: false,
    errorCode: 'Cancelled',
    errorMessage: 'Job cancelled before LLM call.',
    meta: buildBaseMeta({ input_validate: { ok: true, length, truncated } }),
  };
}

function llmFailureResult(
  body: string,
  truncated: boolean,
  extract: TextExtractFailure
): IngestJobResult {
  const llmStage: IngestStageRecord = {
    ok: false,
    duration_ms: extract.durationMs,
    model: getTextModel(),
    prompt_version: PROMPT_VERSION_TEXT,
    reason: extract.errorMessage,
  };
  if (extract.rawOutput !== undefined) {
    llmStage['raw_output_preview'] = extract.rawOutput.slice(0, 1024);
  }
  return {
    ok: false,
    errorCode: 'LlmExtractFailed',
    errorMessage: extract.errorMessage,
    meta: buildBaseMeta({
      input_validate: { ok: true, length: body.length, truncated },
      llm_extract: llmStage,
    }),
  };
}

function successResult(
  body: string,
  truncated: boolean,
  extract: TextExtractSuccess
): IngestJobResult {
  const dslBuildStart = Date.now();
  const dsl = buildDsl(extract.parsed, { source: 'text' });
  const dslBuildMs = Date.now() - dslBuildStart;

  const partialReason: PartialReason | undefined =
    extract.parsed.ingredients.length === 0 || extract.parsed.steps.length === 0
      ? 'empty-extraction'
      : undefined;

  const meta: IngestMeta = {
    ...buildBaseMeta({
      input_validate: { ok: true, length: body.length, truncated },
      llm_extract: {
        ok: true,
        duration_ms: extract.durationMs,
        model: getTextModel(),
        prompt_version: PROMPT_VERSION_TEXT,
        input_tokens: extract.message.usage?.input_tokens,
        output_tokens: extract.message.usage?.output_tokens,
      },
      dsl_build: { ok: true, duration_ms: dslBuildMs },
    }),
    llm_raw_output: tryParse(extract.rawOutput),
  };

  return partialReason ? { ok: true, dsl, meta, partialReason } : { ok: true, dsl, meta };
}

/**
 * Text ingest (`pillars/food/docs/prds/text-ingest`). The whole pipeline
 * is a length check + one Claude call + DSL render. Cancellation between
 * stages only; mid-call cancellation is out of scope.
 */
export const runTextIngest: IngestHandler<'text'> = async (data, ctx) => {
  const trimmed = (data.body ?? '').trim();
  if (trimmed.length < MIN_BODY_LENGTH) return emptyTextResult(trimmed.length);

  const truncated = trimmed.length > MAX_BODY_LENGTH;
  const body = truncated ? trimmed.slice(0, MAX_BODY_LENGTH) : trimmed;

  if (await ctx.isCancelled()) return cancelledResult(body.length, truncated);

  const extract = await extractWithClaudeText({
    body,
    source: 'text',
    contextId: `ingest_source:${data.sourceId}`,
  });

  return extract.ok
    ? successResult(body, truncated, extract)
    : llmFailureResult(body, truncated, extract);
};
