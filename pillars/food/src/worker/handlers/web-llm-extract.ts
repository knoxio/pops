/**
 * Claude extraction + strict JSON validation for the web-llm fallback
 * (`pillars/food/docs/prds/web-llm-fallback`). Single call per ingest.
 * Markdown-fenced output is rejected (the prompt explicitly says
 * "Output ONLY the JSON"); zod violations surface as `LlmExtractFailed`
 * with the raw response preserved in `meta.json.llm_raw_output` for the
 * review queue.
 */
import { ZodError } from 'zod';

import { callWithLogging } from '@pops/ai-telemetry';

import { ANTHROPIC_PROVIDER, FOOD_DOMAIN, foodTelemetryDeps } from '../ai/ai-telemetry-deps.js';
import { extractTextFromMessage, getAnthropicClient } from '../ai/web-llm-anthropic.js';
import {
  PROMPT_VERSION_WEB_LLM,
  WEB_LLM_DEFAULT_MODEL,
  WEB_LLM_MAX_OUTPUT_TOKENS,
  buildWebLlmPrompt,
} from '../prompts/web-llm.js';
import { extractedRecipeSchema } from './web-llm-recipe.js';

import type { AnthropicLike, AnthropicMessage } from '../ai/web-llm-anthropic.js';
import type { ExtractedRecipe } from './web-llm-recipe.js';

export const WEB_LLM_OPERATION = 'recipe-extract-web-llm';

const HAIKU_INPUT_USD_PER_MTOK = 0.25;
const HAIKU_OUTPUT_USD_PER_MTOK = 1.25;

/**
 * Local Haiku 4.5 cost estimate persisted on the recipe meta (`total_cost_usd`,
 * `cost_usd`). Independent of the cross-pillar telemetry cost, which is priced
 * against the ai pillar's `ai_model_pricing` table inside `callWithLogging`.
 */
function localCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * HAIKU_INPUT_USD_PER_MTOK + outputTokens * HAIKU_OUTPUT_USD_PER_MTOK) / 1_000_000
  );
}

export interface WebLlmExtractInputs {
  title: string;
  bodyText: string;
  url: string;
  sourceId: number;
  /** Test seam — overrides the lazy SDK client. */
  client?: AnthropicLike;
  /** Test seam — overrides the env-derived model name. */
  model?: string;
}

export interface WebLlmExtractSuccess {
  ok: true;
  parsed: ExtractedRecipe;
  raw: string;
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface WebLlmExtractFailure {
  ok: false;
  reason: 'malformed-json' | 'schema-violation' | 'empty-response' | 'sdk-error';
  message: string;
  raw: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
}

const FENCED_RE = /^\s*```/;

function parseLlmJson(
  raw: string
): { ok: true; value: unknown } | { ok: false; reason: 'fenced' | 'invalid'; message: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'invalid', message: 'empty response' };
  if (FENCED_RE.test(trimmed)) {
    return { ok: false, reason: 'fenced', message: 'response wrapped in markdown fence' };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (err) {
    return {
      ok: false,
      reason: 'invalid',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function resolveModel(override?: string): string {
  if (override != null && override !== '') return override;
  const envModel = process.env['FOOD_WEB_LLM_MODEL'];
  if (envModel != null && envModel !== '') return envModel;
  return WEB_LLM_DEFAULT_MODEL;
}

/**
 * Issues the single Claude call through `callWithLogging` (cross-pillar
 * telemetry, fire-and-forget) and returns the raw message unchanged.
 */
function callWebLlm(
  inputs: WebLlmExtractInputs,
  model: string,
  prompt: string
): Promise<AnthropicMessage> {
  return callWithLogging(
    {
      provider: ANTHROPIC_PROVIDER,
      model,
      operation: WEB_LLM_OPERATION,
      domain: FOOD_DOMAIN,
      contextId: `ingest_source:${inputs.sourceId}`,
      promptVersion: PROMPT_VERSION_WEB_LLM,
      call: async () => {
        const client = inputs.client ?? getAnthropicClient();
        const created = await client.messages.create({
          model,
          max_tokens: WEB_LLM_MAX_OUTPUT_TOKENS,
          messages: [{ role: 'user', content: prompt }],
        });
        return {
          response: created,
          usage: {
            inputTokens: created.usage.input_tokens,
            outputTokens: created.usage.output_tokens,
          },
        };
      },
    },
    foodTelemetryDeps()
  );
}

function validatedRecipe(text: string): ExtractedRecipe {
  const parsed = parseLlmJson(text);
  if (!parsed.ok) {
    throw Object.assign(new Error(parsed.message), {
      __webLlm: { kind: 'parse', reason: parsed.reason, raw: text },
    });
  }
  const validated = extractedRecipeSchema.safeParse(parsed.value);
  if (!validated.success) {
    throw Object.assign(new Error(validated.error.message), {
      __webLlm: { kind: 'schema', raw: text },
    });
  }
  return validated.data;
}

/**
 * Runs the single Claude call + strict parsing + zod validation. Never
 * throws on extraction-shape problems; surfaces them as
 * `WebLlmExtractFailure` so the caller can decide whether to fail the
 * ingest or fall back further. SDK / network errors propagate via the
 * `sdk-error` branch (caught + wrapped to keep the contract uniform).
 */
export async function extractWithClaudeWebLlm(
  inputs: WebLlmExtractInputs
): Promise<WebLlmExtractSuccess | WebLlmExtractFailure> {
  const model = resolveModel(inputs.model);
  const prompt = buildWebLlmPrompt({
    title: inputs.title,
    url: inputs.url,
    bodyText: inputs.bodyText,
  });
  const start = Date.now();
  try {
    const message = await callWebLlm(inputs, model, prompt);
    const latencyMs = Date.now() - start;
    const text = extractTextFromMessage(message);
    return {
      ok: true,
      parsed: validatedRecipe(text),
      raw: text,
      promptVersion: PROMPT_VERSION_WEB_LLM,
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      costUsd: localCostUsd(message.usage.input_tokens, message.usage.output_tokens),
      latencyMs,
    };
  } catch (err) {
    return classifyExtractError(err, model);
  }
}

interface WebLlmErrorTag {
  __webLlm?: { kind: 'parse' | 'schema'; reason?: 'fenced' | 'invalid'; raw: string };
}

function classifyExtractError(err: unknown, model: string): WebLlmExtractFailure {
  const message = err instanceof Error ? err.message : String(err);
  const tag = (err as WebLlmErrorTag).__webLlm;
  if (tag != null) {
    if (tag.kind === 'schema') {
      return makeFailure('schema-violation', message, tag.raw, model);
    }
    if (tag.reason === 'fenced') {
      return makeFailure('malformed-json', message, tag.raw, model);
    }
    return makeFailure('malformed-json', message, tag.raw, model);
  }
  if (err instanceof ZodError) {
    return makeFailure('schema-violation', err.message, '', model);
  }
  return makeFailure('sdk-error', message, '', model);
}

function makeFailure(
  reason: WebLlmExtractFailure['reason'],
  message: string,
  raw: string,
  model: string
): WebLlmExtractFailure {
  return {
    ok: false,
    reason,
    message,
    raw,
    model,
    promptVersion: PROMPT_VERSION_WEB_LLM,
    latencyMs: 0,
  };
}
