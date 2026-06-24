/**
 * Screenshot ingest handler
 * (`pillars/food/docs/prds/screenshot-ingest`).
 *
 * Reads the image written to disk by the producer, runs one Claude
 * vision call, builds a DSL string from the structured response and
 * posts the `IngestJobResult` back through the BullMQ → REST
 * `workerComplete` loop.
 *
 * Failure semantics:
 * - Malformed JSON / zod fail / SDK throw → `VisionExtractFailed`.
 * - File-read failure → `FileReadFailed`. The worker posts the result
 *   via `workerComplete`, so BullMQ marks the job complete — no
 *   automatic retry. The retry surface is the Failed tab
 *   (`pillars/food/docs/prds/rejected-and-failed-tabs`), which reads
 *   `ingest_sources.error_code` and exposes a Retry button.
 *
 * Cancellation is cooperative: checked before the file read, between
 * the vision call and the DSL build, and after the DSL build. Mid-
 * vision-call cancellation is NOT supported.
 */
import { buildDsl } from './screenshot-dsl.js';
import { extractRecipeFromImage, type ExtractRecipeResult } from './screenshot-extract.js';

import type { IngestJobResult, IngestMeta, PartialReason } from '../../contract/queue/index.js';
import type { IngestHandler } from './types.js';

/**
 * Bumped whenever the extractor's shape changes — handler version
 * mirrors the worker package version. The inbox reads the
 * `extractor_version` field to tell apart stub vs real-handler outputs.
 */
const SCREENSHOT_EXTRACTOR_VERSION = 'pops-worker-food/screenshot@0.1.0';

function getModelOverride(): string | undefined {
  const raw = process.env['FOOD_SCREENSHOT_VISION_MODEL'];
  return raw && raw.trim() !== '' ? raw : undefined;
}

function cancelledResult(): IngestJobResult {
  return {
    ok: false,
    errorCode: 'Cancelled',
    errorMessage: 'Screenshot ingest cancelled before completion.',
    meta: {
      extractor_version: SCREENSHOT_EXTRACTOR_VERSION,
      stages: {},
    },
  };
}

function buildFailureMeta(extraction: Extract<ExtractRecipeResult, { ok: false }>): IngestMeta {
  const stages: IngestMeta['stages'] = {};
  if (extraction.stages.fileRead) {
    const fr = extraction.stages.fileRead;
    stages['file_read'] = {
      ok: fr.ok,
      duration_ms: fr.durationMs,
      ...(fr.bytes != null && { bytes: fr.bytes }),
      ...(fr.error && { reason: fr.error }),
    };
  }
  if (extraction.stages.vision) {
    const v = extraction.stages.vision;
    stages['vision'] = {
      ok: v.ok,
      duration_ms: v.durationMs,
      ...(extraction.vision && {
        model: extraction.vision.model,
        prompt_version: extraction.promptVersion,
        input_tokens: extraction.vision.inputTokens,
        output_tokens: extraction.vision.outputTokens,
        cost_usd: extraction.vision.costUsd,
      }),
      ...(v.error && { reason: v.error }),
    };
  }
  const meta: IngestMeta = {
    extractor_version: SCREENSHOT_EXTRACTOR_VERSION,
    stages,
  };
  if (extraction.vision) {
    meta.total_duration_ms =
      (extraction.stages.fileRead?.durationMs ?? 0) + extraction.vision.latencyMs;
    meta.total_cost_usd = extraction.vision.costUsd;
  }
  return meta;
}

interface SuccessMetaArgs {
  extraction: Extract<ExtractRecipeResult, { ok: true }>;
  dslBuildDurationMs: number;
}

function buildSuccessMeta(args: SuccessMetaArgs): IngestMeta {
  const { vision, parsed, stages, promptVersion } = args.extraction;
  return {
    extractor_version: SCREENSHOT_EXTRACTOR_VERSION,
    stages: {
      file_read: {
        ok: true,
        duration_ms: stages.fileRead.durationMs,
        bytes: stages.fileRead.bytes,
      },
      vision: {
        ok: true,
        duration_ms: stages.vision.durationMs,
        model: vision.model,
        prompt_version: promptVersion,
        input_tokens: vision.inputTokens,
        output_tokens: vision.outputTokens,
        cost_usd: vision.costUsd,
      },
      dsl_build: {
        ok: true,
        duration_ms: args.dslBuildDurationMs,
      },
    },
    total_duration_ms:
      stages.fileRead.durationMs + stages.vision.durationMs + args.dslBuildDurationMs,
    total_cost_usd: vision.costUsd,
    llm_raw_output: parsed,
  };
}

function derivePartialReason(
  extraction: Extract<ExtractRecipeResult, { ok: true }>
): PartialReason | undefined {
  const { parsed } = extraction;
  return parsed.ingredients.length === 0 || parsed.steps.length === 0
    ? 'empty-extraction'
    : undefined;
}

export const runScreenshotIngest: IngestHandler<'screenshot'> = async (data, ctx) => {
  if (await ctx.isCancelled()) return cancelledResult();

  const extraction = await extractRecipeFromImage({
    contentPath: data.contentPath,
    mimeType: data.mimeType,
    model: getModelOverride(),
  });

  if (!extraction.ok) {
    return {
      ok: false,
      errorCode: extraction.errorCode,
      errorMessage: extraction.errorMessage,
      meta: buildFailureMeta(extraction),
    };
  }

  if (await ctx.isCancelled()) return cancelledResult();

  const dslStart = Date.now();
  const dsl = buildDsl(extraction.parsed, { source: 'screenshot' });
  const dslBuildDurationMs = Date.now() - dslStart;

  const partialReason = derivePartialReason(extraction);
  return {
    ok: true,
    dsl,
    meta: buildSuccessMeta({ extraction, dslBuildDurationMs }),
    ...(partialReason && { partialReason }),
  };
};
