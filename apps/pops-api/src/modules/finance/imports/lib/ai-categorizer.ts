/**
 * Use Claude Haiku to categorize unknown transaction descriptions.
 * Results are cached to disk so each unique description only requires one API call.
 *
 * Only the merchant description is sent to the API — no account numbers,
 * card numbers, or personal identifiers.
 */
import Anthropic from '@anthropic-ai/sdk';

import { SETTINGS_KEYS } from '@pops/types';

import { isNamedEnvContext } from '../../../../db.js';
import { getEnv } from '../../../../env.js';
import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { trackInference } from '../../../../lib/inference-middleware.js';
import { logger } from '../../../../lib/logger.js';
import { resolveNumber, resolveString } from '../../../core/settings/index.js';
import {
  getCachedEntry,
  loadCacheFromDisk,
  setCachedEntry,
  type AiCacheEntry,
} from './ai-categorizer-cache.js';
import { AiCategorizationError } from './ai-categorizer-error.js';

export {
  clearAllCache,
  clearCache,
  clearStaleCache,
  getCacheStats,
  type AiCacheEntry,
} from './ai-categorizer-cache.js';
export { AiCategorizationError } from './ai-categorizer-error.js';

const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001';

const getCategorizerModel = (): string =>
  resolveString(SETTINGS_KEYS.FINANCE_AI_CATEGORIZER_MODEL, DEFAULT_AI_MODEL);
const getCategorizerMaxTokens = (): number =>
  resolveNumber(SETTINGS_KEYS.FINANCE_AI_CATEGORIZER_MAX_TOKENS, 200);

export interface AiUsageStats {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface AiCallResult {
  result: AiCacheEntry | null;
  usage?: AiUsageStats;
}

function trackCacheHit(importBatchId: string | undefined): void {
  void trackInference(
    {
      provider: 'claude',
      model: getCategorizerModel(),
      operation: 'entity-match',
      domain: 'finance',
      contextId: importBatchId,
      cached: true,
    },
    async () => null
  );
}

function buildPrompt(rawRow: string): string {
  return `Given this bank transaction data, identify the merchant/entity name and a spending category.

Transaction data: ${rawRow}

Reply in JSON only: {"entityName": "...", "category": "..."}
Common categories: Groceries, Dining, Transport, Utilities, Entertainment, Shopping, Health, Insurance, Subscriptions, Income, Transfer, Government, Education, Travel, Rent, Other.`;
}

interface ApiCallResponse {
  text: string | null;
  inputTokens: number;
  outputTokens: number;
}

async function callApi(
  client: Anthropic,
  rawRow: string,
  sanitizedDescription: string,
  importBatchId: string | undefined
): Promise<ApiCallResponse> {
  const model = getCategorizerModel();
  const maxTokens = getCategorizerMaxTokens();
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

function buildEntryFromText(text: string, rawRow: string): AiCacheEntry {
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

function throwApiError(error: unknown): never {
  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as {
      status: number;
      message?: string;
      error?: { error?: { message?: string } };
    };
    if (apiError.status === 400) {
      const errorMessage =
        apiError.error?.error?.message ??
        (apiError as { message?: string }).message ??
        'Unknown API error';
      if (errorMessage.toLowerCase().includes('credit balance')) {
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

async function callApiOrThrow(
  client: Anthropic,
  rawRow: string,
  sanitizedDescription: string,
  importBatchId?: string
): Promise<ApiCallResponse> {
  try {
    return await callApi(client, rawRow, sanitizedDescription, importBatchId);
  } catch (error) {
    logger.error(
      {
        description: sanitizedDescription,
        error: error instanceof Error ? error.message : String(error),
      },
      '[AI] API call failed'
    );
    throwApiError(error);
  }
}

export async function categorizeWithAi(
  rawRow: string,
  importBatchId?: string
): Promise<AiCallResult> {
  const key = rawRow.toUpperCase().trim();
  const sanitizedDescription = rawRow.trim().slice(0, 100);

  if (isNamedEnvContext()) return { result: null };

  loadCacheFromDisk();

  const cached = getCachedEntry(key);
  if (cached) {
    logger.debug(
      {
        description: sanitizedDescription,
        entityName: cached.entityName,
        category: cached.category,
      },
      '[AI] Cache hit'
    );
    trackCacheHit(importBatchId);
    return { result: cached };
  }

  const apiKey = getEnv('CLAUDE_API_KEY');
  if (!apiKey) {
    throw new AiCategorizationError('CLAUDE_API_KEY not configured', 'NO_API_KEY');
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });
  logger.debug({ description: sanitizedDescription }, '[AI] Calling API (cache miss)');

  const response = await callApiOrThrow(client, rawRow, sanitizedDescription, importBatchId);

  if (!response.text) return { result: null };

  const entry = buildEntryFromText(response.text, rawRow);
  setCachedEntry(key, entry);

  const costUsd =
    (response.inputTokens / 1_000_000) * 1.0 + (response.outputTokens / 1_000_000) * 5.0;
  logger.info(
    {
      description: sanitizedDescription,
      entityName: entry.entityName,
      category: entry.category,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costUsd: costUsd.toFixed(6),
    },
    '[AI] API call successful'
  );

  return {
    result: entry,
    usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens, costUsd },
  };
}
