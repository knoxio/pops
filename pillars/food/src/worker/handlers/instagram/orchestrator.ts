/**
 * PRD-130 — orchestrator for `url-instagram` ingest. Wires acquisition
 * (PRD-129) → caption-heuristic → STT → keyframes → vision →
 * text-fallback with the hierarchical-degradation truth table the PRD
 * prescribes. Per-stage helpers live in `stages.ts` + `extraction.ts`.
 *
 * The orchestrator never throws — every native subprocess + LLM call is
 * wrapped in try/catch downstream, and the result is always a
 * structured `IngestJobResult`.
 */
import { runInstagramAcquisition, type AcquisitionResult } from '../instagram-acquisition.js';
import { buildDsl } from './build-dsl.js';
import { isStructuredCaption } from './caption-heuristic.js';
import { convertAcquisitionFailure } from './convert-acquisition-failure.js';
import { derivePartialReason } from './degradation.js';
import { attemptTextFallback, attemptVision, type ExtractionDeps } from './extraction.js';
import { runKeyframesStage, runSttStage, type KeyframesDeps, type SttDeps } from './stages.js';

import type { IngestJobData, IngestJobResult, IngestMeta } from '../../../contract/queue/index.js';
import type { HandlerContext } from '../types.js';
import type { ExtractedRecipe } from './extracted-recipe.js';

export const PIPELINE_VERSION = 'ig-stt-vision@1';

export interface InstagramIngestDeps extends ExtractionDeps, SttDeps, KeyframesDeps {
  runAcquisitionImpl?: typeof runInstagramAcquisition;
  extractorVersion?: string;
}

type WebData = Extract<IngestJobData, { kind: 'url-instagram' }>;

interface PipelineState {
  acq: Extract<AcquisitionResult, { ok: true }>;
  captionStructured: boolean;
  transcript: string | null;
  transcriptOk: boolean;
  keyframes: string[];
  keyframesOk: boolean;
}

export async function runInstagramPipeline(
  data: WebData,
  ctx: HandlerContext,
  deps: InstagramIngestDeps
): Promise<IngestJobResult> {
  const extractorVersion = deps.extractorVersion ?? PIPELINE_VERSION;
  const meta: IngestMeta = { extractor_version: extractorVersion, stages: {} };

  if (await ctx.isCancelled()) return cancelled(meta);

  const acq = await (deps.runAcquisitionImpl ?? runInstagramAcquisition)(data, ctx);
  meta.stages['acquisition'] = acqStage(acq);
  if (!acq.ok) {
    return convertAcquisitionFailure(acq, { sourceId: data.sourceId, extractorVersion });
  }
  if (await ctx.isCancelled()) return cancelled(meta);

  const state = await prepareInputs(acq, ctx, deps, meta);
  if (state === 'cancelled') return cancelled(meta);

  return runExtraction({ state, deps, meta });
}

async function prepareInputs(
  acq: Extract<AcquisitionResult, { ok: true }>,
  ctx: HandlerContext,
  deps: InstagramIngestDeps,
  meta: IngestMeta
): Promise<PipelineState | 'cancelled'> {
  const captionStructured = isStructuredCaption(acq.caption);
  meta.stages['caption_heuristic'] = {
    structured: captionStructured,
    length: acq.caption?.length ?? 0,
  };

  const sttOutcome = await runSttStage({ acq, captionStructured, deps, meta });
  if (await ctx.isCancelled()) return 'cancelled';

  const kfOutcome = await runKeyframesStage({ acq, deps, meta });
  if (await ctx.isCancelled()) return 'cancelled';

  return {
    acq,
    captionStructured,
    transcript: sttOutcome.transcript,
    transcriptOk: sttOutcome.ok,
    keyframes: kfOutcome.keyframes,
    keyframesOk: kfOutcome.ok,
  };
}

interface RunExtractionArgs {
  state: PipelineState;
  deps: InstagramIngestDeps;
  meta: IngestMeta;
}

async function runExtraction(args: RunExtractionArgs): Promise<IngestJobResult> {
  const visionParsed = await attemptVision(
    {
      caption: args.state.acq.caption,
      transcript: args.state.transcript,
      keyframes: args.state.keyframes,
    },
    args.deps,
    args.meta
  );
  if (visionParsed !== null) {
    return successResult({
      parsed: visionParsed,
      state: args.state,
      meta: args.meta,
      textFallbackUsed: false,
    });
  }
  const fallbackParsed = await attemptTextFallback(args.state.acq.caption, args.deps, args.meta);
  if (fallbackParsed !== null) {
    return successResult({
      parsed: fallbackParsed,
      state: args.state,
      meta: args.meta,
      textFallbackUsed: true,
    });
  }
  return {
    ok: false,
    errorCode: 'AllExtractionPathsFailed',
    errorMessage: 'No extraction path produced a result',
    meta: args.meta,
  };
}

interface SuccessArgs {
  parsed: ExtractedRecipe;
  state: PipelineState;
  meta: IngestMeta;
  textFallbackUsed: boolean;
}

function successResult(args: SuccessArgs): IngestJobResult {
  const start = Date.now();
  const mapped = buildDsl(args.parsed);
  args.meta.stages['dsl_build'] = {
    ok: true,
    duration_ms: Date.now() - start,
    ingredients: mapped.stats.ingredients,
    steps: mapped.stats.steps,
  };
  const partialReason = derivePartialReason({
    captionStructured: args.state.captionStructured,
    transcriptOk: args.state.transcriptOk,
    visionOk: !args.textFallbackUsed,
    keyframesOk: args.state.keyframesOk,
    textFallbackUsed: args.textFallbackUsed,
  });
  const base = { ok: true as const, dsl: mapped.dsl, meta: args.meta };
  return partialReason !== undefined ? { ...base, partialReason } : base;
}

function acqStage(acq: AcquisitionResult): Record<string, unknown> {
  if (acq.ok) {
    return {
      ok: true,
      video_path: acq.videoPath,
      thumbnail_path: acq.thumbnailPath ?? null,
      caption_length: acq.caption?.length ?? 0,
    };
  }
  return { ok: false, kind: acq.kind };
}

function cancelled(meta: IngestMeta): IngestJobResult {
  return {
    ok: false,
    errorCode: 'Cancelled',
    errorMessage: 'Instagram ingest cancelled',
    meta,
  };
}
