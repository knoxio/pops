/**
 * Instagram ingest dispatcher. Acquisition lives in PRD-129
 * (`instagram-acquisition.ts`); the STT + vision pipeline (PRD-130)
 * lives in `instagram/orchestrator.ts`. This file wires runtime config
 * (env-driven model overrides, lazy Anthropic client) into the
 * orchestrator and adapts the result to the dispatch `IngestHandler`
 * signature.
 */
import { getAnthropicClient } from './instagram/anthropic-client.js';
import { PIPELINE_VERSION, runInstagramPipeline } from './instagram/orchestrator.js';

import type { IngestHandler } from './types.js';

export const runInstagramIngest: IngestHandler<'url-instagram'> = async (data, ctx) => {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey === undefined || apiKey === '') {
    return {
      ok: false,
      errorCode: 'MissingApiKey',
      errorMessage: 'ANTHROPIC_API_KEY is required for the Instagram pipeline',
      meta: { extractor_version: PIPELINE_VERSION, stages: {} },
    };
  }
  const visionModel = process.env['FOOD_IG_VISION_MODEL'];
  const whisperModel = process.env['FOOD_WHISPER_MODEL'];
  const anthropicClient = await getAnthropicClient(apiKey);
  return runInstagramPipeline(data, ctx, {
    anthropicClient,
    ...(visionModel ? { visionModel } : {}),
    ...(whisperModel ? { whisperModel } : {}),
  });
};
