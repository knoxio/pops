import { Redis } from 'ioredis';

/**
 * Single Redis connection helper shared by BullMQ. `maxRetriesPerRequest:
 * null` is mandatory — BullMQ uses blocking commands and ioredis's
 * default retry-on-timeout behaviour fights with them, leading to
 * spurious disconnects.
 */
export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}
