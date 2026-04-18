import { Redis } from 'ioredis';

const redisHost = process.env['REDIS_HOST'];
const redisPort = Number(process.env['REDIS_PORT'] ?? 6379);
const keyPrefix = process.env['REDIS_PREFIX'] ?? 'pops:';

let client: Redis | null = null;

if (!redisHost) {
  console.warn('[redis] REDIS_HOST not set — Redis disabled (degraded mode)');
} else {
  client = new Redis({
    host: redisHost,
    port: redisPort,
    lazyConnect: true,
    keyPrefix,
    enableReadyCheck: true,
  });

  client.on('error', (err: Error) => {
    console.warn('[redis] Connection error:', err.message);
  });

  client.on('ready', () => {
    console.warn('[redis] Connected');
  });

  client.on('reconnecting', () => {
    console.warn('[redis] Reconnecting...');
  });
}

export function getRedisClient(): Redis | null {
  return client;
}

export function getRedisStatus(): 'ready' | 'connecting' | 'disconnected' {
  if (!client) return 'disconnected';
  const status = client.status;
  if (status === 'ready') return 'ready';
  if (status === 'connecting' || status === 'reconnecting') return 'connecting';
  return 'disconnected';
}

export async function shutdownRedis(): Promise<void> {
  if (!client) return;

  const currentClient = client;
  client = null;

  try {
    await Promise.race([
      currentClient.quit(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Redis quit timed out')), 5000);
      }),
    ]);
  } catch (err) {
    console.warn(
      '[redis] Graceful shutdown failed, forcing disconnect:',
      err instanceof Error ? err.message : String(err)
    );
    currentClient.disconnect();
  }
}
