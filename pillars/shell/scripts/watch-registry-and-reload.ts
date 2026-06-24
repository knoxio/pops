/**
 * Long-running watcher that ties the registry SSE stream
 * (docs/themes/federation/prds/subscription-model) to the dynamic nginx
 * generator (docs/themes/federation/prds/nginx-config-generator). Part of
 * docs/themes/federation/prds/dynamic-pillar-registration.
 *
 * Opens `GET <registry-url>/registry/subscribe`, ignores the initial
 * `pillar.snapshot` frame, and on every subsequent registered /
 * deregistered / health-changed event triggers a trailing-debounced
 * regen + nginx -t + reload cycle. The `nginx -t` gate runs between
 * regen and reload so a bad rendered conf cannot crash a live nginx;
 * on failure the reload is skipped and `nginx_generator_last_error_at`
 * flips on the optional health endpoint until the next clean cycle.
 *
 * Env: POPS_REGISTRY_URL (or legacy CORE_REGISTRY_URL), POPS_NGINX_OUTPUT,
 * POPS_NGINX_RELOAD_CMD, POPS_NGINX_CONFIG_TEST_CMD (default
 * `nginx -t -c <output>`; empty string disables the gate),
 * POPS_NGINX_DEBOUNCE_MS, POPS_NGINX_BACKOFF_MS,
 * POPS_NGINX_HEALTH_PORT / _HOST / _PATH.
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderNginxConfDynamic } from './generate-nginx-conf.ts';
import {
  createReloadHandler,
  isWatchedEvent,
  type ReloadErrorEvent,
  type ReloadLogger,
} from './nginx-event-reload.ts';
import { type NginxGeneratorHealth } from './nginx-generator-health.ts';
import { consumeSse } from './registry-sse-client.ts';
import { resolveRegistryUrl } from './registry-url-env.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = resolve(SCRIPT_DIR, '..', 'nginx.conf');
const DEFAULT_RELOAD_CMD = 'nginx -s reload';
const MAX_BACKOFF_MS = 30_000;

interface WatcherConfig {
  readonly registryUrl: string;
  readonly outputPath: string;
  readonly reloadCmd: string;
  readonly configTestCmd: string;
  readonly debounceMs: number;
  readonly backoffMs: number;
  readonly healthPort: number | null;
  readonly healthHost: string;
  readonly healthPath: string;
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.length === 0) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalPortEnv(value: string | undefined): number | null {
  if (value === undefined || value.length === 0) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return null;
  return parsed;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function defaultConfigTestCmd(outputPath: string): string {
  return `nginx -t -c ${shellQuote(outputPath)}`;
}

function readConfig(env: NodeJS.ProcessEnv): WatcherConfig {
  const outputPath = env['POPS_NGINX_OUTPUT'] ?? DEFAULT_OUTPUT_PATH;
  const rawConfigTestCmd = env['POPS_NGINX_CONFIG_TEST_CMD'];
  return {
    registryUrl: resolveRegistryUrl(env),
    outputPath,
    reloadCmd: env['POPS_NGINX_RELOAD_CMD'] ?? DEFAULT_RELOAD_CMD,
    configTestCmd: rawConfigTestCmd ?? defaultConfigTestCmd(outputPath),
    debounceMs: parseIntEnv(env['POPS_NGINX_DEBOUNCE_MS'], 250),
    backoffMs: parseIntEnv(env['POPS_NGINX_BACKOFF_MS'], 1000),
    healthPort: parseOptionalPortEnv(env['POPS_NGINX_HEALTH_PORT']),
    healthHost: env['POPS_NGINX_HEALTH_HOST'] ?? '0.0.0.0',
    healthPath: env['POPS_NGINX_HEALTH_PATH'] ?? '/health',
  };
}

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

export interface RunOnceDeps {
  readonly health?: NginxGeneratorHealth;
  readonly execImpl?: (cmd: string) => Promise<void>;
  readonly regenerateImpl?: (config: WatcherConfig) => Promise<void>;
}

async function runOnce(
  config: WatcherConfig,
  signal: AbortSignal,
  logger: ReloadLogger,
  deps: RunOnceDeps = {}
): Promise<void> {
  const exec = deps.execImpl ?? execShell;
  const regen = deps.regenerateImpl ?? runRegen;
  const validate =
    config.configTestCmd.length > 0 ? (): Promise<void> => exec(config.configTestCmd) : undefined;
  const onSuccess =
    deps.health !== undefined ? (): void => deps.health?.recordSuccess() : undefined;
  const onError =
    deps.health !== undefined
      ? (event: ReloadErrorEvent): void => deps.health?.recordError(event)
      : undefined;
  const handler = createReloadHandler({
    regenerate: () => regen(config),
    validateConfig: validate,
    reload: () => exec(config.reloadCmd),
    debounceMs: config.debounceMs,
    logger,
    onSuccess,
    onError,
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

export type WatchRegistryDeps = RunOnceDeps;

export async function watchRegistryAndReload(
  config: WatcherConfig,
  signal: AbortSignal,
  logger: ReloadLogger,
  deps: WatchRegistryDeps = {}
): Promise<void> {
  let backoff = config.backoffMs;
  while (!signal.aborted) {
    try {
      logger.info(`watch-registry: connecting to ${config.registryUrl}/registry/subscribe`);
      await runOnce(config, signal, logger, deps);
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

export { readConfig, runOnce, type WatcherConfig };
