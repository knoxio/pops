/**
 * Lazy Anthropic SDK client + vision-call helper for the food worker.
 *
 * Read keys lazily (not at module load) so tests can run without
 * `ANTHROPIC_API_KEY` set and so the SDK isn't instantiated until the first
 * call lands.
 *
 * The returned `costUsd` is computed locally from the hard-coded pricing
 * below (callers persist it on the recipe meta). Cross-pillar telemetry —
 * usage/cost/latency to the ai pillar — is reported fire-and-forget via
 * `@pops/ai-telemetry`'s `callWithLogging`, which prices the call against the
 * ai pillar's `ai_model_pricing` table independently of this local estimate.
 */
import Anthropic from '@anthropic-ai/sdk';

import { callWithLogging } from '@pops/ai-telemetry';

import { ANTHROPIC_PROVIDER, FOOD_DOMAIN, foodTelemetryDeps } from './ai-telemetry-deps.js';

import type { Message } from '@anthropic-ai/sdk/resources/messages';

export const SCREENSHOT_OPERATION = 'recipe-extract-screenshot';

/**
 * Hard-coded Haiku 4.5 pricing in USD per million tokens, from Anthropic's
 * public pricing page. This is only a local estimate persisted on the recipe
 * meta; the authoritative cost lives in the ai pillar's `ai_model_pricing`
 * table, applied independently by `callWithLogging`.
 */
const HAIKU_4_5_PRICING_USD_PER_MTOK = {
  input: 0.25,
  output: 1.25,
} as const;

const KNOWN_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': HAIKU_4_5_PRICING_USD_PER_MTOK,
  'claude-haiku-4-5': HAIKU_4_5_PRICING_USD_PER_MTOK,
};

export function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = KNOWN_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export interface VisionCallInput {
  mimeType: string;
  base64: string;
  prompt: string;
  model: string;
  /**
   * Output token cap. Vision recipe extractions return JSON; the prompt
   * is short, so 2048 is generous without being wasteful.
   */
  maxTokens?: number;
}

export interface VisionCallResult {
  /** Raw text returned by the assistant — strict JSON expected. */
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

type AnthropicLike = Pick<Anthropic, 'messages'>;

let cachedClient: AnthropicLike | null = null;

function getApiKey(): string {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  return key;
}

function getClient(): AnthropicLike {
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({ apiKey: getApiKey(), maxRetries: 0 });
  return cachedClient;
}

/**
 * Test-only seam: lets unit tests inject a fake SDK without spinning up
 * the real one. Passing `null` resets the cache so subsequent calls
 * lazy-instantiate the real client again.
 */
export function __setAnthropicClientForTests(client: AnthropicLike | null): void {
  cachedClient = client;
}

const ALLOWED_VISION_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Call Claude with a single image + the documented system prompt.
 * Returns the raw text response plus usage; the caller is responsible
 * for JSON-parsing and validating against its handler-specific schema.
 */
function callVision(client: AnthropicLike, input: VisionCallInput): Promise<Message> {
  return callWithLogging<Message>(
    {
      provider: ANTHROPIC_PROVIDER,
      model: input.model,
      operation: SCREENSHOT_OPERATION,
      domain: FOOD_DOMAIN,
      call: async () => {
        const message = await client.messages.create({
          model: input.model,
          max_tokens: input.maxTokens ?? 2048,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: input.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
                    data: input.base64,
                  },
                },
                { type: 'text', text: input.prompt },
              ],
            },
          ],
        });
        return {
          response: message,
          usage: {
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
          },
        };
      },
    },
    foodTelemetryDeps()
  );
}

export async function extractWithClaudeVision(input: VisionCallInput): Promise<VisionCallResult> {
  if (!ALLOWED_VISION_MIMES.has(input.mimeType)) {
    throw new Error(`Unsupported image MIME type for vision call: ${input.mimeType}`);
  }
  const client = getClient();
  const start = Date.now();
  const response = await callVision(client, input);
  const latencyMs = Date.now() - start;
  const text = response.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  return {
    text,
    model: response.model,
    inputTokens,
    outputTokens,
    costUsd: computeCostUsd(response.model, inputTokens, outputTokens),
    latencyMs,
  };
}
