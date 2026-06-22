/**
 * PRD-130 — text-LLM fallback used when the vision call fails AND the
 * reel has a non-trivial caption (≥30 chars; the boundary is inclusive,
 * matching `MIN_CAPTION_LENGTH_FOR_FALLBACK`). Re-implements the same
 * prompt shape PRD-128 will export as `PROMPT_WEB_LLM`; once PRD-128 +
 * PRD-132 land we can dedupe via a shared `extractWithClaudeText` import.
 *
 * Operation name in observability is `recipe-extract-ig-text-fallback`
 * to distinguish from PRD-128's `recipe-extract-web-llm`.
 */
import { callWithLogging } from '@pops/ai-telemetry';

import { ANTHROPIC_PROVIDER, FOOD_DOMAIN, foodTelemetryDeps } from '../../ai/ai-telemetry-deps.js';
import { extractedRecipeSchema, type ExtractedRecipe } from './extracted-recipe.js';

import type { AnthropicLike, AnthropicMessage } from './anthropic-client.js';

export const DEFAULT_TEXT_FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
export const PROMPT_VERSION_TEXT_FALLBACK = 'web-llm-v1.0';
export const TEXT_FALLBACK_OPERATION = 'recipe-extract-ig-text-fallback';
export const MIN_CAPTION_LENGTH_FOR_FALLBACK = 30;

const MAX_TOKENS = 2_000;

const SYSTEM_PROMPT = `You are extracting a recipe from free-form text. Output ONLY a JSON object matching the schema. No prose, no markdown fences.

Schema:
{
  "title": string,
  "summary": string | null,
  "servings": integer | null,
  "prep_time_min": number | null,
  "cook_time_min": number | null,
  "ingredients": [
    { "ingredient_slug": string, "variant_slug": string | null, "prep_state_slug": string | null,
      "qty": number, "unit": string, "notes": string | null }
  ],
  "steps": [
    { "body": string, "duration_min": number | null, "temperature_c": number | null }
  ]
}

Rules:
- Use metric units when available.
- If multiple recipes appear, extract the first one only.
- Quantities the text doesn't supply default to qty=1, unit="count".
`;

export interface ExtractTextFallbackInput {
  caption: string;
}

export interface ExtractTextFallbackOptions {
  client: AnthropicLike;
  model?: string;
}

export interface TextFallbackResult {
  parsed: ExtractedRecipe;
  model: string;
  promptVersion: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

function callTextFallback(
  input: ExtractTextFallbackInput,
  opts: ExtractTextFallbackOptions,
  model: string
): Promise<AnthropicMessage> {
  return callWithLogging<AnthropicMessage>(
    {
      provider: ANTHROPIC_PROVIDER,
      model,
      operation: TEXT_FALLBACK_OPERATION,
      domain: FOOD_DOMAIN,
      promptVersion: PROMPT_VERSION_TEXT_FALLBACK,
      call: async () => {
        const message = await opts.client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: input.caption }],
        });
        return {
          response: message,
          usage: {
            inputTokens: message.usage?.input_tokens ?? 0,
            outputTokens: message.usage?.output_tokens ?? 0,
          },
        };
      },
    },
    foodTelemetryDeps()
  );
}

export async function extractWithTextFallback(
  input: ExtractTextFallbackInput,
  opts: ExtractTextFallbackOptions
): Promise<TextFallbackResult> {
  const model = opts.model ?? DEFAULT_TEXT_FALLBACK_MODEL;
  const start = Date.now();
  const response = await callTextFallback(input, opts, model);
  const durationMs = Date.now() - start;

  const text = firstTextBlock(response);
  if (text === null) throw new TextFallbackError('Anthropic response had no text block');
  if (/^\s*```/.test(text)) {
    throw new TextFallbackError('Anthropic response wrapped JSON in a markdown fence');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new TextFallbackError(
      `Anthropic response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const result = extractedRecipeSchema.safeParse(raw);
  if (!result.success) {
    throw new TextFallbackError(
      `Anthropic response did not match the recipe schema: ${result.error.message}`
    );
  }
  return {
    parsed: result.data,
    model,
    promptVersion: PROMPT_VERSION_TEXT_FALLBACK,
    operation: TEXT_FALLBACK_OPERATION,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    durationMs,
  };
}

function firstTextBlock(message: AnthropicMessage): string | null {
  for (const block of message.content) {
    if (block.type === 'text' && block.text.trim().length > 0) return block.text;
  }
  return null;
}

export class TextFallbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextFallbackError';
  }
}
