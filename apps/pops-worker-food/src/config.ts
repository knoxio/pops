/**
 * Runtime configuration pulled from env. Reading env at import time would
 * make tests painful and prevent `.env`-style overrides; a single load
 * function called from `worker.ts` keeps the surface explicit.
 *
 * Secrets follow pops-api's `env.ts` convention: read from
 * `/run/secrets/<lowercased-name>` first (Docker secrets file mount),
 * fall back to `process.env[NAME]` (dev / non-Docker).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SECRETS_DIR = '/run/secrets';

function readSecret(name: string): string | undefined {
  try {
    const value = readFileSync(join(SECRETS_DIR, name.toLowerCase()), 'utf-8').trim();
    if (value) return value;
  } catch {
    // Falls through to env var on ENOENT / EACCES / etc.
  }
  return process.env[name];
}

export interface WorkerConfig {
  redisUrl: string;
  apiUrl: string;
  internalToken: string;
  concurrency: number;
  ratePerMin: number;
  jobTimeoutSec: number;
  healthPort: number;
  drainTimeoutMs: number;
  /** Pinned semicolon-delimited tool versions for `IngestMeta.extractor_version`. */
  extractorVersion: string;
  /** Per-source workdir root for downloaded media (PRD-110 / PRD-129 / PRD-130). */
  ingestDir: string;
  /** Netscape cookies.txt mounted from the host (PRD-129 operator runbook). */
  instagramCookiesPath: string;
}

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_RATE_PER_MIN = 30;
const DEFAULT_JOB_TIMEOUT_SEC = 300;
const DEFAULT_HEALTH_PORT = 9090;
const DEFAULT_DRAIN_TIMEOUT_MS = 60_000;

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${raw} (expected positive integer)`);
  }
  return parsed;
}

function requireSecret(name: string): string {
  const value = readSecret(name);
  if (value == null || value === '') {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
}

export function loadConfig(): WorkerConfig {
  return {
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    apiUrl: process.env['POPS_API_URL'] ?? 'http://localhost:3000',
    internalToken: requireSecret('POPS_API_INTERNAL_TOKEN'),
    concurrency: readIntEnv('FOOD_WORKER_CONCURRENCY', DEFAULT_CONCURRENCY),
    ratePerMin: readIntEnv('FOOD_INGEST_RATE_PER_MIN', DEFAULT_RATE_PER_MIN),
    jobTimeoutSec: readIntEnv('FOOD_INGEST_TIMEOUT_SEC', DEFAULT_JOB_TIMEOUT_SEC),
    healthPort: readIntEnv('FOOD_WORKER_HEALTH_PORT', DEFAULT_HEALTH_PORT),
    drainTimeoutMs: readIntEnv('FOOD_WORKER_DRAIN_TIMEOUT_MS', DEFAULT_DRAIN_TIMEOUT_MS),
    extractorVersion: process.env['POPS_WORKER_FOOD_VERSION'] ?? 'pops-worker-food@0.1.0',
    ingestDir: process.env['FOOD_INGEST_DIR'] ?? '/data/food/ingest',
    instagramCookiesPath: process.env['INSTAGRAM_COOKIES_PATH'] ?? '/secrets/instagram-cookies.txt',
  };
}
