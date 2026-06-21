/**
 * LLM port for the cerebrum ingest pipeline.
 *
 * The classifier, entity-extractor, and scope-inference stages all need a
 * single capability: send a text prompt at temperature 0 and get the model's
 * text response back. That capability is modelled as the {@link IngestLlm}
 * port so the pipeline can be driven by a real Anthropic client in production
 * and by canned fakes in tests (tests MUST NOT reach a real API).
 *
 * Deviations from the monolith:
 * - **Model overrides / settings**: the monolith reads
 *   `getAiModel('ai.modelOverrides.*')` / `getSettingValue()`. The pillar has
 *   no settings service, so models are hardcoded constants with an optional
 *   `CEREBRUM_*_MODEL` env override. No settings-DB tier.
 * - **Inference logging**: usage/cost/latency is reported to the ai pillar via
 *   `@pops/ai-telemetry` (`callWithLogging`, fire-and-forget) plus the 429
 *   backoff ({@link withRateLimitRetry}) for correctness.
 */
import Anthropic from '@anthropic-ai/sdk';

import { callWithLogging } from '@pops/ai-telemetry';

import {
  ANTHROPIC_PROVIDER,
  CEREBRUM_DOMAIN,
  cerebrumTelemetryDeps,
} from '../ai-telemetry-deps.js';

export const DEFAULT_CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';
export const DEFAULT_ENTITY_EXTRACTOR_MODEL = 'claude-haiku-4-5-20251001';
export const DEFAULT_SCOPE_INFERENCE_MODEL = 'claude-haiku-4-5-20251001';

export interface IngestLlmRequest {
  /** Logical operation label, used only for log context. */
  operation: string;
  model: string;
  prompt: string;
  maxTokens: number;
}

/**
 * Capability the ingest stages depend on. `complete` returns the model's text
 * output, or `null` when the model is unavailable (no API key, transport
 * error) — callers treat `null` as "skip this enrichment / fall back".
 */
export interface IngestLlm {
  complete(req: IngestLlmRequest): Promise<string | null>;
  /** Resolve the model id for a given stage (env override → default). */
  modelFor(stage: 'classifier' | 'entityExtractor' | 'scopeInference'): string;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;
const RATE_LIMIT_STATUS = 429;

function isRateLimit(error: unknown): boolean {
  return (
    error instanceof Error &&
    'status' in error &&
    (error as { status: unknown }).status === RATE_LIMIT_STATUS
  );
}

/**
 * Retry an async op with exponential backoff + jitter on HTTP 429. All
 * Anthropic calls route through this so rate limits are handled consistently.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimit(error) || attempt === MAX_RETRIES) throw error;
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
      console.warn(
        `[cerebrum-ingest] Rate limited (429) on ${context} — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

function envModel(key: string, fallback: string): string {
  const value = process.env[key];
  return value !== undefined && value !== '' ? value : fallback;
}

/**
 * Real Anthropic-backed {@link IngestLlm}. Reads `ANTHROPIC_API_KEY` lazily on
 * each call so a missing key degrades to `null` (the stages fall back) rather
 * than throwing at construction. Model ids come from `CEREBRUM_*_MODEL` env
 * overrides or the hardcoded haiku defaults.
 */
export class AnthropicIngestLlm implements IngestLlm {
  modelFor(stage: 'classifier' | 'entityExtractor' | 'scopeInference'): string {
    switch (stage) {
      case 'classifier':
        return envModel('CEREBRUM_CLASSIFIER_MODEL', DEFAULT_CLASSIFIER_MODEL);
      case 'entityExtractor':
        return envModel('CEREBRUM_ENTITY_EXTRACTOR_MODEL', DEFAULT_ENTITY_EXTRACTOR_MODEL);
      case 'scopeInference':
        return envModel('CEREBRUM_SCOPE_INFERENCE_MODEL', DEFAULT_SCOPE_INFERENCE_MODEL);
    }
  }

  async complete(req: IngestLlmRequest): Promise<string | null> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      console.warn(`[cerebrum-ingest] ANTHROPIC_API_KEY not set — skipping ${req.operation}`);
      return null;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    try {
      const response = await callWithLogging(
        {
          provider: ANTHROPIC_PROVIDER,
          model: req.model,
          operation: req.operation,
          domain: CEREBRUM_DOMAIN,
          call: async () => {
            const created = await withRateLimitRetry(
              () =>
                client.messages.create({
                  model: req.model,
                  max_tokens: req.maxTokens,
                  temperature: 0,
                  messages: [{ role: 'user', content: req.prompt }],
                }),
              req.operation
            );
            return {
              response: created,
              usage: {
                inputTokens: created.usage.input_tokens,
                outputTokens: created.usage.output_tokens,
              },
            };
          },
        },
        cerebrumTelemetryDeps()
      );
      const first = response.content[0];
      return first?.type === 'text' ? first.text : '';
    } catch (err) {
      console.warn(
        `[cerebrum-ingest] ${req.operation} failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }
}
