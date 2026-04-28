/**
 * Use Claude Haiku to categorize unknown transaction descriptions.
 * Results are cached to disk so each unique description only requires one API call.
 *
 * Only the merchant description is sent to the API — no account numbers,
 * card numbers, or personal identifiers.
 */
import Anthropic from '@anthropic-ai/sdk';

import { isNamedEnvContext } from '../../../../db.js';
import { getEnv } from '../../../../env.js';
import { trackInference } from '../../../../lib/inference-middleware.js';
import { logger } from '../../../../lib/logger.js';
import { getSettingValue } from '../../../core/settings/service.js';
import { buildEntryFromText, callApiOrThrow } from './ai-categorizer-api.js';
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

const DEFAULT_CATEGORIZER_MODEL = 'claude-haiku-4-5-20251001';

function getCategorizerModel(): string {
  return getSettingValue('finance.aiCategorizer.model', DEFAULT_CATEGORIZER_MODEL);
}

function getCategorizerMaxTokens(): number {
  return getSettingValue('finance.aiCategorizer.maxTokens', 200);
}

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

  const response = await callApiOrThrow({
    client,
    rawRow,
    sanitizedDescription,
    importBatchId,
    model: getCategorizerModel(),
    maxTokens: getCategorizerMaxTokens(),
  });

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
