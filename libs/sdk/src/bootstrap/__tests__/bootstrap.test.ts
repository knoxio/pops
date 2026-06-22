import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validManifest } from '../../__tests__/fixtures.js';
import { bootstrapPillar } from '../bootstrap.js';
import {
  PillarManifestInvalidError,
  PillarRegistrationFailedError,
  PillarRegistrationRejectedError,
} from '../errors.js';
import {
  RegistryNetworkError,
  RegistryTransportError,
  type CapabilityStatuses,
  type RegisterRequest,
  type RegistryTransport,
} from '../transport.js';

import type { ManifestPayload } from '../../manifest-schema/schema.js';

const TEST_BASE_URL = 'http://finance-api:3004';

interface RecordedTransport extends RegistryTransport {
  registerCalls: number;
  heartbeatCalls: number;
  unregisterCalls: number;
  heartbeats: string[];
  heartbeatCapabilities: (CapabilityStatuses | undefined)[];
  lastRegisterPayload: () => RegisterRequest | undefined;
  lastRegisterManifest: () => ManifestPayload | undefined;
}

interface MakeTransportOptions {
  registerImpl?: () => Promise<{ pillarId: string }>;
  heartbeatImpl?: () => Promise<{ pillarId: string; acknowledgedAt: string }>;
  unregisterImpl?: () => Promise<void>;
}

function makeTransport(options: MakeTransportOptions = {}): RecordedTransport {
  let lastPayload: RegisterRequest | undefined;
  const state: RecordedTransport = {
    registerCalls: 0,
    heartbeatCalls: 0,
    unregisterCalls: 0,
    heartbeats: [],
    heartbeatCapabilities: [],
    lastRegisterPayload: () => lastPayload,
    lastRegisterManifest: () => lastPayload?.manifest,
    async register(payload) {
      state.registerCalls += 1;
      lastPayload = payload;
      if (options.registerImpl) return options.registerImpl();
      return { pillarId: payload.manifest.pillar };
    },
    async heartbeat(pillarId, capabilities) {
      state.heartbeatCalls += 1;
      state.heartbeats.push(pillarId);
      state.heartbeatCapabilities.push(capabilities);
      if (options.heartbeatImpl) return options.heartbeatImpl();
      return { pillarId, acknowledgedAt: new Date().toISOString() };
    },
    async unregister() {
      state.unregisterCalls += 1;
      if (options.unregisterImpl) await options.unregisterImpl();
    },
  };
  return state;
}

function silentLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('bootstrapPillar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('validates, registers, and returns a handle on the happy path', async () => {
    const transport = makeTransport();
    const handle = await bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
      heartbeatMs: 1_000,
    });

    expect(transport.registerCalls).toBe(1);
    expect(handle.pillarId).toBe('finance');

    await handle.stop();
    expect(transport.unregisterCalls).toBe(1);
  });

  it('omits capabilities from register + heartbeat when no reporter is supplied', async () => {
    const transport = makeTransport();
    const handle = await bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
      heartbeatMs: 1_000,
    });

    expect(transport.lastRegisterPayload()?.capabilities).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(transport.heartbeatCapabilities[0]).toBeUndefined();

    await handle.stop();
  });

  it('snapshots the capability reporter on register and each heartbeat', async () => {
    const transport = makeTransport();
    let vectorUp = true;
    const reporter = vi.fn(() => ({ vectorSearch: vectorUp }));
    const handle = await bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
      heartbeatMs: 1_000,
      capabilityReporter: reporter,
    });

    expect(transport.lastRegisterPayload()?.capabilities).toEqual({ vectorSearch: true });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(transport.heartbeatCapabilities[0]).toEqual({ vectorSearch: true });

    // The reporter is re-snapshotted per heartbeat — flipping it down is seen.
    vectorUp = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(transport.heartbeatCapabilities[1]).toEqual({ vectorSearch: false });

    await handle.stop();
  });

  it('coerces a non-semver version (e.g. git SHA) into a valid semver prerelease', async () => {
    const manifest = validManifest();
    manifest.version = '9c163ed63e147ebe10a9e1711546b5c9c6a72751';
    manifest.contract.version = '9c163ed63e147ebe10a9e1711546b5c9c6a72751';
    manifest.contract.tag = 'contract-finance@v9c163ed63e147ebe10a9e1711546b5c9c6a72751';

    const transport = makeTransport();
    const handle = await bootstrapPillar({
      manifest,
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
    });

    expect(transport.registerCalls).toBe(1);
    expect(handle.pillarId).toBe('finance');
    const sent = transport.lastRegisterManifest();
    expect(sent?.version).toBe('0.0.0-sha.9c163ed');
    expect(sent?.contract.version).toBe('0.0.0-sha.9c163ed');
    expect(sent?.contract.tag).toBe('contract-finance@v0.0.0-sha.9c163ed');
    const envelope = transport.lastRegisterPayload();
    expect(envelope?.pillarId).toBe('finance');
    expect(envelope?.baseUrl).toBe(TEST_BASE_URL);

    await handle.stop();
  });

  it('leaves a valid semver version unchanged', async () => {
    const manifest = validManifest();
    manifest.version = '1.2.3';
    manifest.contract.version = '1.2.3';
    manifest.contract.tag = 'contract-finance@v1.2.3';

    const transport = makeTransport();
    await bootstrapPillar({ manifest, baseUrl: TEST_BASE_URL, transport, logger: silentLogger() });

    const sent = transport.lastRegisterManifest();
    expect(sent?.version).toBe('1.2.3');
    expect(sent?.contract.tag).toBe('contract-finance@v1.2.3');
  });

  it('throws PillarManifestInvalidError when manifest is malformed', async () => {
    const bad = validManifest();
    bad.pillar = 'INVALID_UPPERCASE';

    const transport = makeTransport();
    await expect(
      bootstrapPillar({
        manifest: bad,
        baseUrl: TEST_BASE_URL,
        transport,
        logger: silentLogger(),
      })
    ).rejects.toBeInstanceOf(PillarManifestInvalidError);

    expect(transport.registerCalls).toBe(0);
  });

  it('exposes per-field issues on PillarManifestInvalidError', async () => {
    const bad = validManifest();
    bad.routes.queries = ['not.a.valid'];
    bad.routes.queries.push('also.invalid');

    try {
      await bootstrapPillar({
        manifest: bad,
        baseUrl: TEST_BASE_URL,
        transport: makeTransport(),
        logger: silentLogger(),
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PillarManifestInvalidError);
      if (err instanceof PillarManifestInvalidError) {
        expect(err.issues.length).toBeGreaterThan(0);
      }
    }
  });

  it('throws PillarRegistrationRejectedError when registry returns a 4xx', async () => {
    const transport = makeTransport({
      registerImpl: async () => {
        throw new RegistryTransportError('400 Bad Request', {
          status: 400,
          issues: [
            {
              field: 'routes.queries',
              reason: 'duplicate procedure',
              got: 'finance.foo.bar',
              schemaPath: ['routes', 'queries'],
            },
          ],
          retriable: false,
        });
      },
    });

    await expect(
      bootstrapPillar({
        manifest: validManifest(),
        baseUrl: TEST_BASE_URL,
        transport,
        logger: silentLogger(),
      })
    ).rejects.toBeInstanceOf(PillarRegistrationRejectedError);

    expect(transport.registerCalls).toBe(1);
  });

  it('retries on network failure with exponential backoff and eventually fails', async () => {
    const transport = makeTransport({
      registerImpl: async () => {
        throw new RegistryNetworkError('connect ECONNREFUSED', new Error('boom'));
      },
    });

    const promise = bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
      maxRegisterAttempts: 3,
      registerInitialBackoffMs: 10,
      registerMaxBackoffMs: 40,
    });
    const settled = promise.then(
      () => ({ ok: true as const }),
      (err: unknown) => ({ ok: false as const, err })
    );

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.err).toBeInstanceOf(PillarRegistrationFailedError);
    }
    expect(transport.registerCalls).toBe(3);
  });

  it('retries on network failure and succeeds when a later attempt is ok', async () => {
    let attempt = 0;
    const transport = makeTransport({
      registerImpl: async () => {
        attempt += 1;
        if (attempt < 3) {
          throw new RegistryNetworkError('flaky', new Error('boom'));
        }
        return { pillarId: 'finance' };
      },
    });

    const promise = bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
      heartbeatMs: 1_000_000,
      maxRegisterAttempts: 5,
      registerInitialBackoffMs: 10,
      registerMaxBackoffMs: 40,
    });

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    const handle = await promise;
    expect(transport.registerCalls).toBe(3);
    await handle.stop();
  });

  it('retries on 5xx and treats it as transient', async () => {
    let attempt = 0;
    const transport = makeTransport({
      registerImpl: async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new RegistryTransportError('503 Service Unavailable', {
            status: 503,
            retriable: true,
          });
        }
        return { pillarId: 'finance' };
      },
    });

    const promise = bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
      heartbeatMs: 1_000_000,
      maxRegisterAttempts: 3,
      registerInitialBackoffMs: 5,
      registerMaxBackoffMs: 10,
    });

    await vi.advanceTimersByTimeAsync(5);
    const handle = await promise;
    expect(transport.registerCalls).toBe(2);
    await handle.stop();
  });

  it('fires heartbeat at the configured interval', async () => {
    const transport = makeTransport();
    const handle = await bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
      heartbeatMs: 1_000,
    });

    expect(transport.heartbeatCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(transport.heartbeatCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(transport.heartbeatCalls).toBe(3);
    expect(transport.heartbeats.every((id) => id === 'finance')).toBe(true);

    await handle.stop();
  });

  it('stop() clears the heartbeat interval and calls unregister', async () => {
    const transport = makeTransport();
    const handle = await bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
      heartbeatMs: 500,
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(transport.heartbeatCalls).toBe(1);

    await handle.stop();
    expect(transport.unregisterCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(transport.heartbeatCalls).toBe(1);
  });

  it('stop() is idempotent and only unregisters once', async () => {
    const transport = makeTransport();
    const handle = await bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
      heartbeatMs: 1_000,
    });

    await handle.stop();
    await handle.stop();
    expect(transport.unregisterCalls).toBe(1);
  });

  it('heartbeat failures do not crash the loop', async () => {
    let heartbeatAttempt = 0;
    const logger = silentLogger();
    const transport = makeTransport({
      heartbeatImpl: async () => {
        heartbeatAttempt += 1;
        if (heartbeatAttempt === 1) {
          throw new RegistryNetworkError('timeout', new Error('boom'));
        }
        return { pillarId: 'finance', acknowledgedAt: '2026-01-01T00:00:00Z' };
      },
    });

    const handle = await bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger,
      heartbeatMs: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(transport.heartbeatCalls).toBe(2);
    expect(logger.warn).toHaveBeenCalled();

    await handle.stop();
  });

  it('mounts a /health route on the provided app', async () => {
    type HealthHandler = (
      req: unknown,
      res: {
        json: (body: unknown) => unknown;
        status: (code: number) => {
          json: (body: unknown) => unknown;
          status: (code: number) => unknown;
        };
      }
    ) => void;
    const routes: Record<string, HealthHandler> = {};
    const app = {
      get(path: string, handler: HealthHandler): unknown {
        routes[path] = handler;
        return undefined;
      },
    };

    const transport = makeTransport();
    const handle = await bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      app,
      transport,
      logger: silentLogger(),
      heartbeatMs: 10_000,
    });

    const handler = routes['/healthz'];
    expect(handler).toBeDefined();

    const body: { json: unknown }[] = [];
    const res = {
      json(b: unknown): unknown {
        body.push({ json: b });
        return undefined;
      },
      status(): { json: (b: unknown) => unknown; status: (c: number) => unknown } {
        return res;
      },
    };
    handler?.({}, res);

    expect(body[0]?.json).toMatchObject({
      ok: true,
      pillar: 'finance',
      version: '1.2.3',
    });

    await handle.stop();
  });

  it('best-effort unregister: stop() resolves even if unregister throws', async () => {
    const transport = makeTransport({
      unregisterImpl: async () => {
        throw new Error('registry down');
      },
    });

    const handle = await bootstrapPillar({
      manifest: validManifest(),
      baseUrl: TEST_BASE_URL,
      transport,
      logger: silentLogger(),
      heartbeatMs: 1_000,
    });

    await expect(handle.stop()).resolves.toBeUndefined();
  });
});
