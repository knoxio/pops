/**
 * PRD-128 — Claude extraction + strict JSON validation for the web-llm
 * fallback. Single call per ingest. Markdown-fenced output is rejected
 * (the prompt explicitly says "Output ONLY the JSON"); zod violations
 * surface as `LlmExtractFailed` with the raw response preserved in
 * `meta.json.llm_raw_output` for the review queue.
 */
import { ZodError } from 'zod';

import { extractTextFromMessage, getAnthropicClient } from '../ai/web-llm-anthropic.js';
import { callClaudeWithLogging } from '../ai/web-llm-log.js';
import {
  PROMPT_VERSION_WEB_LLM,
  WEB_LLM_DEFAULT_MODEL,
  WEB_LLM_MAX_OUTPUT_TOKENS,
  buildWebLlmPrompt,
} from '../prompts/web-llm.js';
import { extractedRecipeSchema } from './web-llm-recipe.js';

import type { AnthropicLike } from '../ai/web-llm-anthropic.js';
import type { CallClaudeLogPayload } from '../ai/web-llm-log.js';
import type { ExtractedRecipe } from './web-llm-recipe.js';

export interface WebLlmExtractInputs {
  title: string;
  bodyText: string;
  url: string;
  sourceId: number;
  /** Test seam — overrides the lazy SDK client. */
  client?: AnthropicLike;
  /** Test seam — receives the inference-log payload. */
  onLog?: (payload: CallClaudeLogPayload) => void;
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
  try {
    const wrapped = await callClaudeWithLogging({
      operation: 'recipe-extract-web-llm',
      contextId: `ingest_source:${inputs.sourceId}`,
      promptVersion: PROMPT_VERSION_WEB_LLM,
      model,
      onLog: inputs.onLog,
      call: async () => {
        const client = inputs.client ?? getAnthropicClient();
        const message = await client.messages.create({
          model,
          max_tokens: WEB_LLM_MAX_OUTPUT_TOKENS,
          messages: [{ role: 'user', content: prompt }],
        });
        const text = extractTextFromMessage(message);
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
        return {
          parsed: validated.data,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          raw: text,
        };
      },
    });
    return {
      ok: true,
      parsed: wrapped.parsed,
      raw: wrapped.raw,
      promptVersion: PROMPT_VERSION_WEB_LLM,
      model,
      inputTokens: wrapped.inputTokens,
      outputTokens: wrapped.outputTokens,
      costUsd: wrapped.costUsd,
      latencyMs: wrapped.latencyMs,
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
