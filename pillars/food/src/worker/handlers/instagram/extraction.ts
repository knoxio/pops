import { extractWithTextFallback, MIN_CAPTION_LENGTH_FOR_FALLBACK } from './text-fallback.js';
/**
 * PRD-130 — the "extract a recipe" half of the orchestrator. Split out
 * of `orchestrator.ts` to keep each file under the per-file lint cap.
 *
 * Tries the Claude vision call first; on any failure, falls through to
 * the text-LLM fallback when the caption is long enough; if neither
 * produces a recipe, the orchestrator returns
 * `errorCode='AllExtractionPathsFailed'`.
 */
import { extractWithClaudeVision } from './vision.js';

import type { IngestMeta } from '../../../contract/queue/index.js';
import type { AnthropicLike } from './anthropic-client.js';
import type { ExtractedRecipe } from './extracted-recipe.js';

export interface ExtractionDeps {
  anthropicClient: AnthropicLike;
  visionModel?: string;
  textFallbackModel?: string;
  extractWithVisionImpl?: typeof extractWithClaudeVision;
  extractWithTextFallbackImpl?: typeof extractWithTextFallback;
}

export interface ExtractionInputs {
  caption: string | null;
  transcript: string | null;
  keyframes: readonly string[];
}

export type ExtractionResult =
  | { tag: 'vision'; parsed: ExtractedRecipe }
  | { tag: 'text-fallback'; parsed: ExtractedRecipe }
  | { tag: 'failed' };

export async function attemptVision(
  inputs: ExtractionInputs,
  deps: ExtractionDeps,
  meta: IngestMeta
): Promise<ExtractedRecipe | null> {
  try {
    const result = await (deps.extractWithVisionImpl ?? extractWithClaudeVision)(
      {
        caption: inputs.caption,
        transcript: inputs.transcript,
        keyframePaths: inputs.keyframes,
      },
      { client: deps.anthropicClient, model: deps.visionModel }
    );
    meta.stages['vision'] = {
      ok: true,
      duration_ms: result.durationMs,
      model: result.model,
      prompt_version: result.promptVersion,
      keyframes_sent: result.keyframesSent,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    };
    return result.parsed;
  } catch (err) {
    meta.stages['vision'] = {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
    return null;
  }
}

export async function attemptTextFallback(
  caption: string | null,
  deps: ExtractionDeps,
  meta: IngestMeta
): Promise<ExtractedRecipe | null> {
  if (caption === null || caption.length < MIN_CAPTION_LENGTH_FOR_FALLBACK) {
    meta.stages['text_fallback'] = { skipped: true, reason: 'caption too short or missing' };
    return null;
  }
  try {
    const result = await (deps.extractWithTextFallbackImpl ?? extractWithTextFallback)(
      { caption },
      { client: deps.anthropicClient, model: deps.textFallbackModel }
    );
    meta.stages['text_fallback'] = {
      ok: true,
      duration_ms: result.durationMs,
      model: result.model,
      operation: result.operation,
      prompt_version: result.promptVersion,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    };
    return result.parsed;
  } catch (err) {
    meta.stages['text_fallback'] = {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
    return null;
  }
}
