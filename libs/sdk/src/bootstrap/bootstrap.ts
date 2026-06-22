import { type ManifestPayload } from '../manifest-schema/schema.js';
import { validateManifestPayload } from '../manifest-schema/validate.js';
import { errSummary, PillarManifestInvalidError } from './errors.js';
import { mountHealthRoute, type HealthApp } from './health-route.js';
import { consoleLogger, type BootstrapLogger } from './logger.js';
import { registerWithRetry } from './register.js';
import {
  createHttpRegistryTransport,
  type CapabilityStatuses,
  type RegistryTransport,
} from './transport.js';

/**
 * Snapshots this pillar's live capability statuses for the keys it owns
 * (`<capabilityKey> → up/down`). Invoked on register and on every heartbeat so
 * the registry always carries the freshest status. Optional — a pillar that
 * declares no capabilities omits it. See {@link CapabilityStatuses}.
 */
export type CapabilityReporter = () => CapabilityStatuses;

export interface BootstrapPillarOptions {
  manifest: ManifestPayload;
  /**
   * Base URL the registry should record for this pillar — the address
   * other pillars dial to reach its `/health` and `/uri/resolve` routes.
   * Must be a valid absolute URL (e.g. `http://finance-api:3004`). Persisted
   * server-side as the `PillarRegistryEntry.baseUrl` column; carried in the
   * register envelope this pillar POSTs to the registry's register route
   * (currently `/core.registry.register` — see `bootstrap/transport.ts`; the
   * canonical `/registry/register` is introduced in a later phase and is not
   * live yet). The manifest is PUSHED in that register envelope and re-served
   * in the discovery snapshot — it is never pulled over HTTP from this base URL.
   */
  baseUrl: string;
  /**
   * Optional snapshot of this pillar's owned capability statuses, called on
   * register and every heartbeat. Pillars without capabilities omit it; the
   * register/heartbeat wire then carries no `capabilities` field (the registry
   * treats an absent field as "nothing reported", preserving backward compat).
   */
  capabilityReporter?: CapabilityReporter;
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
const DEFAULT_REGISTRY_URL_FALLBACK = 'http://registry-api:3001';

export async function bootstrapPillar(
  options: BootstrapPillarOptions
): Promise<PillarBootstrapHandle> {
  const logger = options.logger ?? consoleLogger();

  const normalized = coerceManifestVersion(options.manifest);
  const validation = validateManifestPayload(normalized);
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

  const capabilityReporter = options.capabilityReporter;

  const registration = await registerWithRetry({
    transport,
    manifest,
    baseUrl: options.baseUrl,
    capabilities: capabilityReporter?.(),
    logger,
    maxAttempts: options.maxRegisterAttempts ?? DEFAULT_MAX_REGISTER_ATTEMPTS,
    initialBackoffMs: options.registerInitialBackoffMs ?? DEFAULT_REGISTER_INITIAL_BACKOFF_MS,
    maxBackoffMs: options.registerMaxBackoffMs ?? DEFAULT_REGISTER_MAX_BACKOFF_MS,
    setTimeoutImpl,
  });

  return startRuntime({
    pillarId: registration.pillarId,
    transport,
    logger,
    heartbeatMs,
    capabilityReporter,
    setIntervalImpl,
    clearIntervalImpl,
  });
}

interface StartRuntimeArgs {
  pillarId: string;
  transport: RegistryTransport;
  logger: BootstrapLogger;
  heartbeatMs: number;
  capabilityReporter: CapabilityReporter | undefined;
  setIntervalImpl: typeof setInterval;
  clearIntervalImpl: typeof clearInterval;
}

function startRuntime(args: StartRuntimeArgs): PillarBootstrapHandle {
  let stopped = false;
  const interval = args.setIntervalImpl(() => {
    if (stopped) return;
    args.transport.heartbeat(args.pillarId, args.capabilityReporter?.()).catch((err: unknown) => {
      args.logger.warn('[pillar-sdk] heartbeat failed', {
        pillar: args.pillarId,
        err: errSummary(err),
      });
    });
  }, args.heartbeatMs);

  if (typeof (interval as { unref?: () => void }).unref === 'function') {
    (interval as { unref: () => void }).unref();
  }

  args.logger.info('[pillar-sdk] pillar bootstrapped', {
    pillar: args.pillarId,
    heartbeatMs: args.heartbeatMs,
  });

  return {
    pillarId: args.pillarId,
    async stop() {
      if (stopped) return;
      stopped = true;
      args.clearIntervalImpl(interval);
      try {
        await args.transport.unregister(args.pillarId);
      } catch (err) {
        args.logger.warn('[pillar-sdk] unregister failed (best-effort)', {
          pillar: args.pillarId,
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

const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

/**
 * Normalise a raw `BUILD_VERSION` into a valid manifest version.
 *
 * Watchtower-driven deploys inject the git SHA as `BUILD_VERSION`, but the
 * manifest schema requires semver. Rather than crash boot, coerce a
 * non-semver value into `0.0.0-sha.<7chars>` (a valid semver prerelease).
 * Already-semver values pass through unchanged.
 */
function coerceManifestVersion(manifest: ManifestPayload): ManifestPayload {
  const raw = manifest.version;
  if (SEMVER_RE.test(raw)) return manifest;
  const short = raw.slice(0, 7);
  const coerced = `0.0.0-sha.${short}`;
  return {
    ...manifest,
    version: coerced,
    contract: {
      ...manifest.contract,
      version: coerced,
      tag: `contract-${manifest.pillar}@v${coerced}`,
    },
  };
}
