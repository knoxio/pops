/**
 * PRD-131 — screenshot ingest handler.
 *
 * Replaces the PRD-126 NotImplemented stub. Reads the image written to
 * disk by the producer (PRD-125), runs one Claude vision call, builds a
 * DSL string from the structured response and posts the
 * `IngestJobResult` back through the BullMQ → tRPC workerComplete loop.
 *
 * Per PRD: a single vision call per ingest. Malformed JSON and SDK
 * failures map to `VisionExtractFailed` (terminal — no retry). File-read
 * failures map to `FileReadFailed`, which BullMQ retries since they may
 * be transient FS issues.
 */
import { extractRecipeFromImage, type ExtractRecipeResult } from './screenshot-extract.js';

import type { IngestJobResult, IngestMeta, PartialReason } from '@pops/food-contracts';

import type { IngestHandler } from './types.js';

/**
 * Bumped whenever the extractor's shape changes — handler version
 * mirrors the worker package version. PRD-126's `extractor_version`
 * field reads this to let the inbox tell apart stub vs real-handler
 * outputs.
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

function buildSuccessMeta(extraction: Extract<ExtractRecipeResult, { ok: true }>): IngestMeta {
  const { vision, parsed, stages, promptVersion } = extraction;
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
        duration_ms: stages.dslBuild.durationMs,
      },
    },
    total_duration_ms:
      stages.fileRead.durationMs + stages.vision.durationMs + stages.dslBuild.durationMs,
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

  const partialReason = derivePartialReason(extraction);
  return {
    ok: true,
    dsl: extraction.dsl,
    meta: buildSuccessMeta(extraction),
    ...(partialReason && { partialReason }),
  };
};
