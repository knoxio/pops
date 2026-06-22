/**
 * Finance-categorizer AI entity cache (`ai_entity_cache.json`).
 *
 * Process-global in-memory `Map` persisted to a JSON file beside the finance
 * DB. Re-homed from core (gap #3489): the cache is finance-categorizer state,
 * not AI-ops telemetry. The cache path defaults next to `finance.db`
 * (`FINANCE_SQLITE_PATH`), overridable via `AI_CACHE_PATH` for test isolation.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { DEFAULT_FINANCE_SQLITE_PATH } from '../finance-sqlite-path.js';

export interface AiCacheEntry {
  description: string;
  /**
   * Suggested entity name from the LLM. `null` when the description has no
   * recoverable merchant (#2449) — caller should route the transaction to the
   * uncertain bucket instead of inventing a placeholder entity.
   */
  entityName: string | null;
  /** Legacy single-category string. Prefer `tags` when present. */
  category: string;
  /** Multi-tag array returned by the updated prompt. Absent in old cache entries. */
  tags?: string[];
  cachedAt: string;
}

const cache = new Map<string, AiCacheEntry>();
let diskLoaded = false;

function getCachePath(): string {
  return (
    process.env['AI_CACHE_PATH'] ??
    join(
      dirname(
        process.env['FINANCE_SQLITE_PATH'] ??
          process.env['SQLITE_PATH'] ??
          DEFAULT_FINANCE_SQLITE_PATH
      ),
      'ai_entity_cache.json'
    )
  );
}

export function loadCacheFromDisk(): void {
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
    console.warn(`[AI] Loaded cache from disk (${entries.length} entries) at ${path}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[AI] Failed to load cache from disk at ${path}, starting fresh: ${message}`);
  }
}

export function saveCacheToDisk(): void {
  const path = getCachePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const entries = [...cache.values()];
    writeFileSync(path, JSON.stringify(entries, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[AI] Failed to save cache to disk at ${path}: ${message}`);
  }
}

export function clearCache(): void {
  cache.clear();
  diskLoaded = false;
}

export function getCacheStats(): { totalEntries: number; diskSizeBytes: number } {
  loadCacheFromDisk();
  const path = getCachePath();
  let diskSizeBytes = 0;
  try {
    if (existsSync(path)) diskSizeBytes = statSync(path).size;
  } catch {
    // Ignore stat errors
  }
  return { totalEntries: cache.size, diskSizeBytes };
}

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

export function clearAllCache(): number {
  loadCacheFromDisk();
  const count = cache.size;
  cache.clear();
  saveCacheToDisk();
  return count;
}

export function getCachedEntry(key: string): AiCacheEntry | undefined {
  return cache.get(key);
}

export function setCachedEntry(key: string, entry: AiCacheEntry): void {
  cache.set(key, entry);
  saveCacheToDisk();
}
