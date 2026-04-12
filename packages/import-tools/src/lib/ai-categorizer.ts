import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import Anthropic from '@anthropic-ai/sdk';

import type { AiCacheEntry } from './types.js';

const CACHE_PATH = process.env['AI_CACHE_PATH'] ?? './ai_entity_cache.json';

/**
 * Load the AI entity cache from disk.
 * Each unique merchant description only costs one API call ever.
 */
function loadCache(): Map<string, AiCacheEntry> {
  if (!existsSync(CACHE_PATH)) return new Map();
  const raw = readFileSync(CACHE_PATH, 'utf-8');
  const entries = JSON.parse(raw) as AiCacheEntry[];
  return new Map(entries.map((e) => [e.description.toUpperCase(), e]));
}

function saveCache(cache: Map<string, AiCacheEntry>): void {
  const entries = Array.from(cache.values());
  writeFileSync(CACHE_PATH, JSON.stringify(entries, null, 2));
}

/**
 * Use Claude Haiku to categorize an unknown transaction description.
 * Results are cached so each unique description only requires one API call.
 *
 * Only the merchant description is sent to the API — no account numbers,
 * card numbers, or personal identifiers.
 */
export async function categorizeWithAi(description: string): Promise<AiCacheEntry | null> {
  const cache = loadCache();
  const key = description.toUpperCase().trim();

  const cached = cache.get(key);
  if (cached) return cached;

  const apiKey = process.env['CLAUDE_API_KEY'];
  if (!apiKey) {
    console.warn('[ai] No CLAUDE_API_KEY set, skipping AI categorization');
    return null;
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Given this bank transaction description, identify the merchant/entity name and a spending category.

Transaction description: "${description}"

Reply in JSON only: {"entityName": "...", "category": "..."}
Common categories: Groceries, Dining, Transport, Utilities, Entertainment, Shopping, Health, Insurance, Subscriptions, Income, Transfer, Government, Education, Travel, Rent, Other.`,
      },
    ],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as { entityName: string; category: string };
    const entry: AiCacheEntry = {
      description: description.trim(),
      entityName: parsed.entityName,
      category: parsed.category,
      cachedAt: new Date().toISOString(),
    };
    cache.set(key, entry);
    saveCache(cache);
    return entry;
  } catch {
    console.warn('[ai] Failed to parse AI response:', text);
    return null;
  }
}
