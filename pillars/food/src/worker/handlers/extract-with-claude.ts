import { callWithLogging } from '@pops/ai-telemetry';

import { ANTHROPIC_PROVIDER, FOOD_DOMAIN, foodTelemetryDeps } from '../ai/ai-telemetry-deps.js';
import {
  createAnthropicClient,
  type AnthropicLike,
  type AnthropicMessage,
} from '../ai/anthropic.js';
import { PROMPT_VERSION_TEXT, renderTextPrompt } from '../prompts/text.js';
import { extractedRecipeSchema, type ExtractedRecipe } from './extracted-recipe.js';

import type { ZodError } from 'zod';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_OUTPUT_TOKENS = 2048;

export function getTextModel(): string {
  return process.env['FOOD_TEXT_LLM_MODEL'] ?? DEFAULT_MODEL;
}

function getApiKey(): string | null {
  const key = process.env['ANTHROPIC_API_KEY'];
  return key && key !== '' ? key : null;
}

let cachedClient: AnthropicLike | null = null;
let cachedClientKey: string | null = null;

let testClientOverride: AnthropicLike | null = null;

export function __setTextIngestClientForTests(client: AnthropicLike | null): void {
  testClientOverride = client;
}

function resolveClient(apiKey: string): AnthropicLike {
  if (testClientOverride) return testClientOverride;
  if (cachedClient && cachedClientKey === apiKey) return cachedClient;
  cachedClient = createAnthropicClient(apiKey);
  cachedClientKey = apiKey;
  return cachedClient;
}

export interface TextExtractInput {
  body: string;
  /** Picks the `ai_inference_log.operation` value — schema + prompt are identical. */
  source: 'text' | 'ig-text-fallback';
  contextId: string;
}

export interface TextExtractSuccess {
  ok: true;
  parsed: ExtractedRecipe;
  rawOutput: string;
  message: AnthropicMessage;
  durationMs: number;
}

export interface TextExtractFailure {
  ok: false;
  errorMessage: string;
  rawOutput?: string;
  durationMs: number;
}

export type TextExtractResult = TextExtractSuccess | TextExtractFailure;

function extractTextOutput(message: AnthropicMessage): string | null {
  for (const block of message.content) {
    if (block.type === 'text' && typeof block.text === 'string') return block.text;
  }
  return null;
}

function formatZodIssues(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
}

function pickOperation(source: TextExtractInput['source']): string {
  return source === 'ig-text-fallback' ? 'recipe-extract-ig-text-fallback' : 'recipe-extract-text';
}

async function callClaude(
  input: TextExtractInput,
  client: AnthropicLike,
  model: string,
  prompt: string
): Promise<
  | { ok: true; message: AnthropicMessage; durationMs: number }
  | { ok: false; errorMessage: string; durationMs: number }
> {
  const start = Date.now();
  try {
    const message = await callWithLogging<AnthropicMessage>(
      {
        provider: ANTHROPIC_PROVIDER,
        model,
        operation: pickOperation(input.source),
        domain: FOOD_DOMAIN,
        contextId: input.contextId,
        promptVersion: PROMPT_VERSION_TEXT,
        call: async () => {
          const created = await client.messages.create({
            model,
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: 0,
            messages: [{ role: 'user', content: prompt }],
          });
          return {
            response: created,
            usage: {
              inputTokens: created.usage?.input_tokens ?? 0,
              outputTokens: created.usage?.output_tokens ?? 0,
            },
          };
        },
      },
      foodTelemetryDeps()
    );
    return { ok: true, message, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Claude call failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

type ParseOutcome = { ok: true; parsed: ExtractedRecipe } | { ok: false; errorMessage: string };

function parseAndValidate(rawOutput: string): ParseOutcome {
  let json: unknown;
  try {
    json = JSON.parse(rawOutput);
  } catch (err) {
    return {
      ok: false,
      errorMessage: `Claude returned non-JSON output: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const parsedResult = extractedRecipeSchema.safeParse(json);
  if (!parsedResult.success) {
    return { ok: false, errorMessage: `Schema violation: ${formatZodIssues(parsedResult.error)}` };
  }
  return { ok: true, parsed: parsedResult.data };
}

/**
 * Shared text-LLM extraction surface. `runTextIngest` calls with
 * `source='text'`; the Instagram vision-fallback path calls with
 * `source='ig-text-fallback'`. The prompt template, JSON schema, and
 * model are identical — only the `operation` written to
 * `ai_inference_log` differs.
 */
export async function extractWithClaudeText(input: TextExtractInput): Promise<TextExtractResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, errorMessage: 'ANTHROPIC_API_KEY not set', durationMs: 0 };
  }
  const model = getTextModel();
  const client = resolveClient(apiKey);
  const callResult = await callClaude(input, client, model, renderTextPrompt(input.body));
  if (!callResult.ok) {
    return { ok: false, errorMessage: callResult.errorMessage, durationMs: callResult.durationMs };
  }
  const rawOutput = extractTextOutput(callResult.message);
  if (rawOutput == null) {
    return {
      ok: false,
      errorMessage: 'Claude response had no text content',
      durationMs: callResult.durationMs,
    };
  }
  const parsed = parseAndValidate(rawOutput);
  if (!parsed.ok) {
    return {
      ok: false,
      errorMessage: parsed.errorMessage,
      rawOutput,
      durationMs: callResult.durationMs,
    };
  }
  return {
    ok: true,
    parsed: parsed.parsed,
    rawOutput,
    message: callResult.message,
    durationMs: callResult.durationMs,
  };
}
