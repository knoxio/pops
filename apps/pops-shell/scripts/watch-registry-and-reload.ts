#!/usr/bin/env tsx
/**
 * Long-running watcher that ties PRD-163's registry SSE stream to
 * PRD-232's dynamic nginx generator (Theme 13 PRD-228 US-03).
 *
 * On startup it opens `GET <registry-url>/registry/subscribe`, ignores
 * the initial `pillar.snapshot` frame (the dispatcher already reflects
 * boot state), and on every subsequent `pillar.registered`,
 * `pillar.deregistered`, or `pillar.health-changed` event triggers a
 * trailing-debounced regen + nginx reload (250ms window).
 *
 * Deploy shape — DEFERRED. Two viable shapes:
 *   1. Sidecar inside the nginx container. The watcher writes
 *      `/etc/nginx/conf.d/default.conf` and runs `nginx -s reload`.
 *      Lowest latency; same container so `nginx` is local.
 *   2. Standalone Node container on the docker network. The watcher
 *      writes a shared volume mounted into nginx, then issues
 *      `docker kill -s HUP nginx` (or hits the in-cluster nginx admin
 *      endpoint). Cleanly separated; needs a docker socket OR an
 *      `nginx_status`-style reload trigger.
 *
 * The current implementation defaults to shape (1) — invoking `nginx`
 * via `child_process.spawn`. To use shape (2), override `RELOAD_CMD`
 * in the environment (e.g. `docker kill -s HUP pops-nginx`). The
 * docker-compose wiring for either shape is a follow-up; this PR
 * ships the script, the unit tests, and the deploy note.
 *
 * Env:
 *   CORE_REGISTRY_URL       default http://core-api:3001
 *   POPS_NGINX_OUTPUT       default <repo>/apps/pops-shell/nginx.conf
 *   POPS_NGINX_RELOAD_CMD   shell command run on each reload; default `nginx -s reload`
 *   POPS_NGINX_DEBOUNCE_MS  default 250
 *   POPS_NGINX_BACKOFF_MS   initial reconnect backoff; default 1000 (capped at 30s)
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_REGISTRY_URL, renderNginxConfDynamic } from './generate-nginx-conf.ts';
import { createReloadHandler, isWatchedEvent, type ReloadLogger } from './nginx-event-reload.ts';
import { consumeSse } from './registry-sse-client.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = resolve(SCRIPT_DIR, '..', 'nginx.conf');
const DEFAULT_RELOAD_CMD = 'nginx -s reload';
const MAX_BACKOFF_MS = 30_000;

interface WatcherConfig {
  readonly registryUrl: string;
  readonly outputPath: string;
  readonly reloadCmd: string;
  readonly debounceMs: number;
  readonly backoffMs: number;
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.length === 0) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readConfig(env: NodeJS.ProcessEnv): WatcherConfig {
  return {
    registryUrl: env['CORE_REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL,
    outputPath: env['POPS_NGINX_OUTPUT'] ?? DEFAULT_OUTPUT_PATH,
    reloadCmd: env['POPS_NGINX_RELOAD_CMD'] ?? DEFAULT_RELOAD_CMD,
    debounceMs: parseIntEnv(env['POPS_NGINX_DEBOUNCE_MS'], 250),
    backoffMs: parseIntEnv(env['POPS_NGINX_BACKOFF_MS'], 1000),
  };
}

function formatErrorDetail(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err === undefined) return '';
  return String(err);
}

const consoleLogger: ReloadLogger = {
  info: (message) => process.stdout.write(`${message}\n`),
  error: (message, err) => {
    const detail = formatErrorDetail(err);
    process.stderr.write(detail.length > 0 ? `${message}: ${detail}\n` : `${message}\n`);
  },
};

function execShell(cmd: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, { shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`reload command exited with code=${code} signal=${signal}`));
    });
  });
}

async function runRegen(config: WatcherConfig): Promise<void> {
  const conf = await renderNginxConfDynamic(config.registryUrl);
  await writeFile(config.outputPath, conf, 'utf8');
}

async function runOnce(
  config: WatcherConfig,
  signal: AbortSignal,
  logger: ReloadLogger
): Promise<void> {
  const handler = createReloadHandler({
    regenerate: () => runRegen(config),
    reload: () => execShell(config.reloadCmd),
    debounceMs: config.debounceMs,
    logger,
  });
  try {
    await consumeSse({
      url: `${config.registryUrl.replace(/\/+$/, '')}/registry/subscribe`,
      signal,
      onFrame: (frame) => {
        if (!isWatchedEvent(frame.event)) return;
        handler.trigger(frame.event);
      },
    });
    await handler.flush();
  } finally {
    handler.stop();
  }
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveSleep) => {
    const timer = setTimeout(resolveSleep, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolveSleep();
      },
      { once: true }
    );
  });
}

export async function watchRegistryAndReload(
  config: WatcherConfig,
  signal: AbortSignal,
  logger: ReloadLogger = consoleLogger
): Promise<void> {
  let backoff = config.backoffMs;
  while (!signal.aborted) {
    try {
      logger.info(`watch-registry: connecting to ${config.registryUrl}/registry/subscribe`);
      await runOnce(config, signal, logger);
      logger.info('watch-registry: SSE stream ended; reconnecting');
      backoff = config.backoffMs;
    } catch (err: unknown) {
      if (signal.aborted) break;
      logger.error('watch-registry: SSE connection failed', err);
      await sleep(backoff, signal);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const controller = new AbortController();
  const onSignal = (): void => controller.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  await watchRegistryAndReload(config, controller.signal);
}

const invokedAsScript =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`watch-registry-and-reload failed: ${message}\n`);
    process.exit(1);
  });
}

export { readConfig, runOnce };
