#!/usr/bin/env tsx
/**
 * CLI entrypoint for the nginx event-reload watcher
 * (docs/themes/federation/prds/dynamic-pillar-registration). Reads env,
 * wires up the optional health endpoint, and runs the watcher until
 * SIGINT/SIGTERM. Kept thin so the watcher core
 * (`watchRegistryAndReload`) stays test-friendly.
 */
import { fileURLToPath } from 'node:url';

import { createNginxGeneratorHealth, startHealthEndpoint } from './nginx-generator-health.ts';
import { readConfig, watchRegistryAndReload } from './watch-registry-and-reload.ts';

import type { ReloadLogger } from './nginx-event-reload.ts';

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

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const controller = new AbortController();
  const onSignal = (): void => controller.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const health = createNginxGeneratorHealth();
  let healthEndpoint: { close: () => Promise<void> } | undefined;
  if (config.healthPort !== null) {
    healthEndpoint = await startHealthEndpoint({
      health,
      port: config.healthPort,
      host: config.healthHost,
      path: config.healthPath,
    });
    consoleLogger.info(
      `watch-registry: health endpoint listening on ${config.healthHost}:${config.healthPort}${config.healthPath}`
    );
  }

  try {
    await watchRegistryAndReload(config, controller.signal, consoleLogger, { health });
  } finally {
    await healthEndpoint?.close();
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`watch-registry-and-reload failed: ${message}\n`);
    process.exit(1);
  });
}

export { main };
