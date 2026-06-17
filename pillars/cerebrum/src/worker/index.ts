/**
 * Entry point for the cerebrum pillar worker.
 *
 * Boots BullMQ `Worker`s for the two queues the pillar's HTTP server produces
 * into but never consumes: `pops-embeddings` (dense-vector index generation)
 * and `pops-curation` (engram classify/extract/scope enrichment). It opens the
 * pillar's own `cerebrum.db` (the same handle the API server opens) and
 * constructs the peer clients, embedding client, and ingest LLM from env —
 * mirroring `src/api/server.ts`.
 *
 * Lifecycle:
 *   - Redis unconfigured (`REDIS_URL` / `REDIS_HOST` absent) → log + clean exit
 *     (never crash). Embedding generation simply doesn't run.
 *   - `EMBEDDING_API_KEY` absent → the embeddings worker is not started (no
 *     embedder); the curation worker still runs.
 *   - SIGTERM / SIGINT → close both workers + the Redis connection, then close
 *     the db handle, then exit.
 *
 * This file runs as `node dist/worker/index.js` from the SAME image the API
 * server ships (the Dockerfile copies all of `dist`).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';

import { resolveCerebrumSqlitePath } from '../api/cerebrum-sqlite-path.js';
import { resolveEngramRoot } from '../api/modules/engrams/instance.js';
import { AnthropicIngestLlm } from '../api/modules/ingest/llm.js';
import { CURATION_QUEUE_NAME } from '../api/modules/ingest/queue.js';
import { resolvePeerClientsFromEnv } from '../api/modules/retrieval/peer-clients.js';
import { TemplateRegistry } from '../api/modules/templates/registry.js';
import { EMBEDDINGS_QUEUE_NAME } from '../api/modules/thalamus/queue.js';
import { openCerebrumDb } from '../db/index.js';
import { processCurationJob, type CurationJobData } from './curation-handler.js';
import { resolveEmbeddingPortFromEnv } from './embedding-client.js';
import {
  processEmbeddingJob,
  type EmbeddingsHandlerDeps,
  type EmbeddingsJobData,
} from './embeddings-handler.js';

function resolveRedisUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const url = env['REDIS_URL'];
  if (url !== undefined && url.length > 0) return url;
  const host = env['REDIS_HOST'];
  if (host === undefined || host.length === 0) return null;
  return `redis://${host}:${env['REDIS_PORT'] ?? '6379'}`;
}

function resolveTemplatesDir(): string {
  const envDir = process.env['CEREBRUM_TEMPLATES_DIR'];
  if (envDir) return envDir;
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'api',
    'modules',
    'templates',
    'defaults'
  );
}

type OpenedDb = ReturnType<typeof openCerebrumDb>;

interface WorkerRuntime {
  db: OpenedDb;
  templates: TemplateRegistry;
  engramRoot: string;
  peers: ReturnType<typeof resolvePeerClientsFromEnv>;
  connection: Redis;
}

function buildWorkers(rt: WorkerRuntime): Worker[] {
  const { db, templates, engramRoot, peers, connection } = rt;
  const opts = { connection, stalledInterval: 30_000 } as const;
  const workers: Worker[] = [];

  const embedder = resolveEmbeddingPortFromEnv();
  if (embedder === undefined) {
    console.warn('[cerebrum-worker] EMBEDDING_API_KEY not set — embeddings worker disabled.');
  } else {
    const embedDeps: EmbeddingsHandlerDeps = {
      db: db.db,
      raw: db.raw,
      vecAvailable: db.vecAvailable,
      engramRoot,
      templates,
      peers,
      embedder,
    };
    workers.push(
      new Worker<EmbeddingsJobData>(
        EMBEDDINGS_QUEUE_NAME,
        (job: Job<EmbeddingsJobData>) => processEmbeddingJob(embedDeps, job.data),
        opts
      )
    );
  }

  const curationDeps = { db: db.db, engramRoot, templates, llm: new AnthropicIngestLlm() };
  workers.push(
    new Worker<CurationJobData>(
      CURATION_QUEUE_NAME,
      (job: Job<CurationJobData>) => processCurationJob(curationDeps, job.data),
      opts
    )
  );

  for (const worker of workers) {
    worker.on('failed', (job, err) => {
      console.error(
        `[cerebrum-worker] job failed (${worker.name}/${job?.id ?? '?'}): ${err.message}`
      );
    });
  }
  return workers;
}

function installShutdown(workers: Worker[], connection: Redis, db: OpenedDb): void {
  const shutdown = (signal: NodeJS.Signals): void => {
    console.warn(`[cerebrum-worker] shutting down (${signal})`);
    Promise.all(workers.map((w) => w.close()))
      .then(() => connection.quit())
      .then(() => {
        db.raw.close();
        process.exit(0);
      })
      .catch((err: unknown) => {
        console.error('[cerebrum-worker] shutdown error', err);
        process.exit(1);
      });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function main(): void {
  const redisUrl = resolveRedisUrl();
  if (redisUrl === null) {
    console.warn(
      '[cerebrum-worker] Redis not configured (REDIS_URL/REDIS_HOST) — nothing to consume; exiting.'
    );
    return;
  }

  const db = openCerebrumDb(resolveCerebrumSqlitePath());
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const workers = buildWorkers({
    db,
    templates: new TemplateRegistry(resolveTemplatesDir()),
    engramRoot: resolveEngramRoot(),
    peers: resolvePeerClientsFromEnv(),
    connection,
  });

  console.warn(`[cerebrum-worker] started (queues: ${workers.map((w) => w.name).join(', ')})`);
  installShutdown(workers, connection, db);
}

try {
  main();
} catch (err: unknown) {
  console.error('[cerebrum-worker] bootstrap failed', err);
  process.exit(1);
}
