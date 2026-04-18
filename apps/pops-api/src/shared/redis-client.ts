/**
 * Optional Redis client for the embedding pipeline.
 *
 * Wraps the shared Redis connection from src/redis.ts. Redis is not required —
 * the API starts and operates without it (degraded mode: vector caching disabled).
 * Configure via REDIS_HOST / REDIS_PORT env vars.
 */
import { getRedisClient } from '../redis.js';

import type { Redis } from 'ioredis';

export function getRedis(): Redis | null {
  return getRedisClient();
}

export function isRedisAvailable(): boolean {
  const client = getRedisClient();
  if (!client) return false;
  return client.status === 'ready';
}

/** No-op — redis.ts self-initialises on module load. */
export function initRedis(): void {}

/** No-op — redis.ts is closed by shutdownRedis() in index.ts. */
export async function closeRedis(): Promise<void> {}

const REDIS_PREFIX = process.env['REDIS_PREFIX'] ?? 'pops:';

export function redisKey(...parts: string[]): string {
  return REDIS_PREFIX + parts.join(':');
}
