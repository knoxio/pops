import { stat, writeFile } from 'node:fs/promises';

import { SETTINGS_KEYS } from '@pops/types';

import { resolveNumber } from '../../core/settings/index.js';

/** Allowed hostnames for image downloads. */
const ALLOWED_IMAGE_HOSTS = new Set(['image.tmdb.org', 'artworks.thetvdb.com']);

export interface RateLimiter {
  acquire(): Promise<void>;
}

export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
      console.warn(`[ImageCache] Blocked download from untrusted host: ${parsed.hostname}`);
      return false;
    }
    return true;
  } catch {
    console.warn(`[ImageCache] Invalid URL: ${url}`);
    return false;
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function attemptDownload(
  url: string,
  destPath: string,
  rateLimiter?: RateLimiter
): Promise<'success' | 'permanent-failure' | 'transient-failure'> {
  try {
    if (rateLimiter) await rateLimiter.acquire();
    const response = await fetch(url);
    if (response.status >= 400 && response.status < 500) {
      console.warn(`[ImageCache] ${response.status} for ${url} — skipping`);
      return 'permanent-failure';
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destPath, buffer);
    return 'success';
  } catch {
    return 'transient-failure';
  }
}

async function fetchWithRetries(
  url: string,
  destPath: string,
  rateLimiter?: RateLimiter
): Promise<void> {
  const maxRetries = resolveNumber(SETTINGS_KEYS.TMDB_IMAGE_MAX_RETRIES, 2);
  const retryDelayMs = resolveNumber(SETTINGS_KEYS.TMDB_IMAGE_RETRY_DELAY_MS, 500);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await attemptDownload(url, destPath, rateLimiter);
    if (result === 'success' || result === 'permanent-failure') return;
    if (attempt === maxRetries) {
      console.warn(`[ImageCache] Failed to download ${url} after ${maxRetries + 1} attempts`);
      return;
    }
    const delay = retryDelayMs * (attempt + 1);
    console.warn(`[ImageCache] Attempt ${attempt + 1} failed for ${url}, retrying in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
  }
}

/**
 * Download a single image to disk, validating the URL host, skipping if the
 * file already exists, and retrying transient failures.
 */
export async function downloadImage(
  url: string,
  destPath: string,
  rateLimiter?: RateLimiter
): Promise<void> {
  if (!isAllowedUrl(url)) return;
  if (await fileExists(destPath)) return;
  await fetchWithRetries(url, destPath, rateLimiter);
}
