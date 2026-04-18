import { Redis, type RedisOptions } from 'ioredis';

function getRedisOptions(): RedisOptions {
  return {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? 6379),
    // Required for BullMQ — disables ioredis retry-on-timeout behaviour that
    // conflicts with BullMQ's own blocking commands.
    maxRetriesPerRequest: null,
  };
}

export function createRedisConnection(): Redis {
  return new Redis(getRedisOptions());
}
