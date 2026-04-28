import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { trackInference } from '../../../../lib/inference-middleware.js';
import { logger } from '../../../../lib/logger.js';
import { AiCategorizationError } from './ai-categorizer-error.js';

/**
 * AI categorizer API helpers — prompt building, API call, and error handling.
 */
import type Anthropic from '@anthropic-ai/sdk';

import type { AiCacheEntry } from './ai-categorizer-cache.js';

export interface ApiCallResponse {
  text: string | null;
  inputTokens: number;
  outputTokens: number;
}

export interface ApiCallOptions {
  client: Anthropic;
  rawRow: string;
  sanitizedDescription: string;
  importBatchId: string | undefined;
  model: string;
  maxTokens: number;
}

export function buildPrompt(rawRow: string): string {
  return `Given this bank transaction data, identify the merchant/entity name and a spending category.

Transaction data: ${rawRow}

Reply in JSON only: {"entityName": "...", "category": "..."}
Common categories: Groceries, Dining, Transport, Utilities, Entertainment, Shopping, Health, Insurance, Subscriptions, Income, Transfer, Government, Education, Travel, Rent, Other.`;
}

export async function callApi(opts: ApiCallOptions): Promise<ApiCallResponse> {
  const { client, rawRow, sanitizedDescription, importBatchId, model, maxTokens } = opts;
  const response = await trackInference(
    {
      provider: 'claude',
      model,
      operation: 'entity-match',
      domain: 'finance',
      contextId: importBatchId,
    },
    () =>
      withRateLimitRetry(
        () =>
          client.messages.create({
            model,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: buildPrompt(rawRow) }],
          }),
        sanitizedDescription,
        { logger, logPrefix: '[AI]' }
      )
  );
  const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export function buildEntryFromText(text: string, rawRow: string): AiCacheEntry {
  const cleanedText = text
    .trim()
    .replaceAll(/^```(?:json)?\s*\n?/gm, '')
    .replaceAll(/\n?```\s*$/gm, '');
  const parsed = JSON.parse(cleanedText) as { entityName: string; category: string };
  return {
    description: rawRow.trim(),
    entityName: parsed.entityName,
    category: parsed.category,
    cachedAt: new Date().toISOString(),
  };
}

export function throwApiError(error: unknown): never {
  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as {
      status: number;
      message?: string;
      error?: { error?: { message?: string } };
    };
    if (apiError.status === 400) {
      const msg =
        apiError.error?.error?.message ??
        (apiError as { message?: string }).message ??
        'Unknown API error';
      if (msg.toLowerCase().includes('credit balance')) {
        throw new AiCategorizationError(
          'Anthropic API credit balance too low. Please add credits at https://console.anthropic.com/settings/plans',
          'INSUFFICIENT_CREDITS'
        );
      }
    }
    throw new AiCategorizationError(
      `Anthropic API error: ${apiError.message ?? 'Unknown error'}`,
      'API_ERROR'
    );
  }
  throw new AiCategorizationError(
    `Failed to categorize: ${error instanceof Error ? error.message : 'Unknown error'}`,
    'API_ERROR'
  );
}

export async function callApiOrThrow(opts: ApiCallOptions): Promise<ApiCallResponse> {
  try {
    return await callApi(opts);
  } catch (error) {
    logger.error(
      {
        description: opts.sanitizedDescription,
        error: error instanceof Error ? error.message : String(error),
      },
      '[AI] API call failed'
    );
    throwApiError(error);
  }
}
