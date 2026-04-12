/**
 * Use Claude Haiku to categorize unknown transaction descriptions.
 * Results are cached to disk (ai_entity_cache.json) so each unique description
 * only requires one API call, even across process restarts (FS-007).
 *
 * Only the merchant description is sent to the API — no account numbers,
 * card numbers, or personal identifiers.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import Anthropic from '@anthropic-ai/sdk';
import { aiUsage } from '@pops/db-types';

import { getDrizzle, isNamedEnvContext } from '../../../../db.js';
import { getEnv } from '../../../../env.js';
import { withRateLimitRetry } from '../../../../lib/ai-retry.js';
import { logger } from '../../../../lib/logger.js';

export interface AiCacheEntry {
  description: string;
  entityName: string;
  category: string;
  cachedAt: string;
}

export interface AiUsageStats {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// In-memory hot cache, hydrated from disk on first access
const cache = new Map<string, AiCacheEntry>();
let diskLoaded = false;

function getCachePath(): string {
  return (
    process.env['AI_CACHE_PATH'] ??
    join(dirname(process.env['SQLITE_PATH'] ?? './data/pops.db'), 'ai_entity_cache.json')
  );
}

function loadCacheFromDisk(): void {
  if (diskLoaded) return;
  diskLoaded = true;
  const path = getCachePath();
  if (!existsSync(path)) return;
  try {
    const raw = readFileSync(path, 'utf-8');
    const entries = JSON.parse(raw) as AiCacheEntry[];
    for (const entry of entries) {
      cache.set(entry.description.toUpperCase().trim(), entry);
    }
    logger.info({ path, entries: entries.length }, '[AI] Loaded cache from disk');
  } catch (err) {
    logger.warn(
      { path, error: err instanceof Error ? err.message : String(err) },
      '[AI] Failed to load cache from disk, starting fresh'
    );
  }
}

function saveCacheToDisk(): void {
  const path = getCachePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const entries = Array.from(cache.values());
    writeFileSync(path, JSON.stringify(entries, null, 2));
  } catch (err) {
    logger.warn(
      { path, error: err instanceof Error ? err.message : String(err) },
      '[AI] Failed to save cache to disk'
    );
  }
}

/** Clear the in-memory cache and reset disk-loaded flag (for testing) */
export function clearCache(): void {
  cache.clear();
  diskLoaded = false;
}

/** Get cache statistics: total entries and disk size in bytes. */
export function getCacheStats(): { totalEntries: number; diskSizeBytes: number } {
  loadCacheFromDisk();
  const path = getCachePath();
  let diskSizeBytes = 0;
  try {
    if (existsSync(path)) {
      diskSizeBytes = statSync(path).size;
    }
  } catch {
    // Ignore stat errors
  }
  return { totalEntries: cache.size, diskSizeBytes };
}

/** Remove cache entries older than maxAgeDays. Returns number of entries removed. */
export function clearStaleCache(maxAgeDays: number): number {
  loadCacheFromDisk();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const [key, entry] of cache) {
    if (new Date(entry.cachedAt).getTime() < cutoff) {
      cache.delete(key);
      removed++;
    }
  }
  if (removed > 0) saveCacheToDisk();
  return removed;
}

/** Clear entire cache. Returns number of entries removed. */
export function clearAllCache(): number {
  loadCacheFromDisk();
  const count = cache.size;
  cache.clear();
  saveCacheToDisk();
  return count;
}

import { AiCategorizationError } from './ai-categorizer-error.js';
export { AiCategorizationError } from './ai-categorizer-error.js';

// Shared AI retry helper lives in src/lib/ai-retry.ts

export async function categorizeWithAi(
  rawRow: string,
  importBatchId?: string
): Promise<{ result: AiCacheEntry | null; usage?: AiUsageStats }> {
  const key = rawRow.toUpperCase().trim();
  const sanitizedDescription = rawRow.trim().substring(0, 100); // Limit for logging

  // Named envs are isolated test databases — no point calling the Claude API
  // against synthetic data. Skip immediately and let callers route to uncertain.
  if (isNamedEnvContext()) {
    return { result: null };
  }

  // Hydrate in-memory cache from disk on first access
  loadCacheFromDisk();

  const cached = cache.get(key);
  if (cached) {
    logger.debug(
      {
        description: sanitizedDescription,
        entityName: cached.entityName,
        category: cached.category,
      },
      '[AI] Cache hit'
    );

    // Track cache hit
    getDrizzle()
      .insert(aiUsage)
      .values({
        description: rawRow.trim(),
        entityName: cached.entityName,
        category: cached.category,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        cached: 1,
        importBatchId: importBatchId ?? null,
        createdAt: new Date().toISOString(),
      })
      .run();

    return { result: cached };
  }

  const apiKey = getEnv('CLAUDE_API_KEY');
  if (!apiKey) {
    throw new AiCategorizationError('CLAUDE_API_KEY not configured', 'NO_API_KEY');
  }

  // maxRetries=0: SDK-level retries disabled — we handle retries ourselves via withRateLimitRetry
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  logger.debug({ description: sanitizedDescription }, '[AI] Calling API (cache miss)');

  try {
    const response = await withRateLimitRetry(
      () =>
        client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [
            {
              role: 'user',
              content: `Given this bank transaction data, identify the merchant/entity name and a spending category.

Transaction data: ${rawRow}

Reply in JSON only: {"entityName": "...", "category": "..."}
Common categories: Groceries, Dining, Transport, Utilities, Entertainment, Shopping, Health, Insurance, Subscriptions, Income, Transfer, Government, Education, Travel, Rent, Other.`,
            },
          ],
        }),
      sanitizedDescription,
      { logger, logPrefix: '[AI]' }
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
    if (!text) return { result: null };

    // Strip markdown code fences if present (Claude sometimes wraps JSON in ```json...```)
    const cleanedText = text
      .trim()
      .replace(/^```(?:json)?\s*\n?/gm, '')
      .replace(/\n?```\s*$/gm, '');
    const parsed = JSON.parse(cleanedText) as { entityName: string; category: string };
    const entry: AiCacheEntry = {
      description: rawRow.trim(),
      entityName: parsed.entityName,
      category: parsed.category,
      cachedAt: new Date().toISOString(),
    };
    cache.set(key, entry);
    saveCacheToDisk();

    // Track API usage and cost
    // Haiku 4.5 pricing: $1.00/MTok input, $5.00/MTok output
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

    getDrizzle()
      .insert(aiUsage)
      .values({
        description: rawRow.trim(),
        entityName: parsed.entityName,
        category: parsed.category,
        inputTokens,
        outputTokens,
        costUsd,
        cached: 0,
        importBatchId: importBatchId ?? null,
        createdAt: new Date().toISOString(),
      })
      .run();

    logger.info(
      {
        description: sanitizedDescription,
        entityName: parsed.entityName,
        category: parsed.category,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(6),
      },
      '[AI] API call successful'
    );

    return {
      result: entry,
      usage: { inputTokens, outputTokens, costUsd },
    };
  } catch (error) {
    logger.error(
      {
        description: sanitizedDescription,
        error: error instanceof Error ? error.message : String(error),
      },
      '[AI] API call failed'
    );

    // Check if it's an Anthropic API error
    if (error && typeof error === 'object' && 'status' in error) {
      const apiError = error as {
        status: number;
        message?: string;
        error?: { error?: { message?: string } };
      };

      // Insufficient credits - special handling
      if (apiError.status === 400) {
        const errorMessage =
          apiError.error?.error?.message ||
          (apiError as { message?: string }).message ||
          'Unknown API error';

        if (errorMessage.toLowerCase().includes('credit balance')) {
          throw new AiCategorizationError(
            'Anthropic API credit balance too low. Please add credits at https://console.anthropic.com/settings/plans',
            'INSUFFICIENT_CREDITS'
          );
        }
      }

      // Other API errors
      throw new AiCategorizationError(
        `Anthropic API error: ${apiError.message || 'Unknown error'}`,
        'API_ERROR'
      );
    }

    // Generic error
    throw new AiCategorizationError(
      `Failed to categorize: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'API_ERROR'
    );
  }
}
