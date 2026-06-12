import { type ManifestPayload } from '../manifest-schema/schema.js';
import { validateManifestPayload } from '../manifest-schema/validate.js';
import { errSummary, PillarManifestInvalidError } from './errors.js';
import { mountHealthRoute, type HealthApp } from './health-route.js';
import { consoleLogger, type BootstrapLogger } from './logger.js';
import { registerWithRetry } from './register.js';
import { createHttpRegistryTransport, type RegistryTransport } from './transport.js';

export interface BootstrapPillarOptions {
  manifest: ManifestPayload;
  app?: HealthApp;
  transport?: RegistryTransport;
  heartbeatMs?: number;
  maxRegisterAttempts?: number;
  registerInitialBackoffMs?: number;
  registerMaxBackoffMs?: number;
  logger?: BootstrapLogger;
  registryUrl?: string;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
  setTimeoutImpl?: typeof setTimeout;
}

export interface PillarBootstrapHandle {
  pillarId: string;
  stop(): Promise<void>;
}

const DEFAULT_HEARTBEAT_MS = 10_000;
const DEFAULT_MAX_REGISTER_ATTEMPTS = 5;
const DEFAULT_REGISTER_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_REGISTER_MAX_BACKOFF_MS = 30_000;
const DEFAULT_REGISTRY_URL_ENV = 'POPS_REGISTRY_URL';
const DEFAULT_REGISTRY_URL_FALLBACK = 'http://core-api:3001';

export async function bootstrapPillar(
  options: BootstrapPillarOptions
): Promise<PillarBootstrapHandle> {
  const logger = options.logger ?? consoleLogger();

  const validation = validateManifestPayload(options.manifest);
  if (!validation.ok) {
    throw new PillarManifestInvalidError(validation.issues);
  }
  const manifest = validation.payload;

  const transport = options.transport ?? defaultTransport(options.registryUrl);
  const setIntervalImpl = options.setIntervalImpl ?? setInterval;
  const clearIntervalImpl = options.clearIntervalImpl ?? clearInterval;
  const setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

  mountHealthRoute(options.app, manifest, logger);

  await registerWithRetry({
    transport,
    manifest,
    logger,
    maxAttempts: options.maxRegisterAttempts ?? DEFAULT_MAX_REGISTER_ATTEMPTS,
    initialBackoffMs: options.registerInitialBackoffMs ?? DEFAULT_REGISTER_INITIAL_BACKOFF_MS,
    maxBackoffMs: options.registerMaxBackoffMs ?? DEFAULT_REGISTER_MAX_BACKOFF_MS,
    setTimeoutImpl,
  });

  return startRuntime({
    manifest,
    transport,
    logger,
    heartbeatMs,
    setIntervalImpl,
    clearIntervalImpl,
  });
}

interface StartRuntimeArgs {
  manifest: ManifestPayload;
  transport: RegistryTransport;
  logger: BootstrapLogger;
  heartbeatMs: number;
  setIntervalImpl: typeof setInterval;
  clearIntervalImpl: typeof clearInterval;
}

function startRuntime(args: StartRuntimeArgs): PillarBootstrapHandle {
  let stopped = false;
  const interval = args.setIntervalImpl(() => {
    if (stopped) return;
    args.transport.heartbeat(args.manifest.pillar).catch((err: unknown) => {
      args.logger.warn('[pillar-sdk] heartbeat failed', {
        pillar: args.manifest.pillar,
        err: errSummary(err),
      });
    });
  }, args.heartbeatMs);

  if (typeof (interval as { unref?: () => void }).unref === 'function') {
    (interval as { unref: () => void }).unref();
  }

  args.logger.info('[pillar-sdk] pillar bootstrapped', {
    pillar: args.manifest.pillar,
    heartbeatMs: args.heartbeatMs,
  });

  return {
    pillarId: args.manifest.pillar,
    async stop() {
      if (stopped) return;
      stopped = true;
      args.clearIntervalImpl(interval);
      try {
        await args.transport.unregister(args.manifest.pillar);
      } catch (err) {
        args.logger.warn('[pillar-sdk] unregister failed (best-effort)', {
          pillar: args.manifest.pillar,
          err: errSummary(err),
        });
      }
    },
  };
}

function defaultTransport(explicitUrl: string | undefined): RegistryTransport {
  const url = explicitUrl ?? process.env[DEFAULT_REGISTRY_URL_ENV] ?? DEFAULT_REGISTRY_URL_FALLBACK;
  return createHttpRegistryTransport({ baseUrl: url });
}
