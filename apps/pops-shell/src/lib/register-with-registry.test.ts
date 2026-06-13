import { describe, expect, it, vi } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk';

import {
  SHELL_PILLAR_ID,
  buildShellManifest,
  registerShellWithRegistry,
  type RegisterShellEnv,
} from './register-with-registry';

const VALID_ENV: RegisterShellEnv = {
  registryBaseUrl: 'http://core-api:3001',
  shellBaseUrl: 'https://pops.local',
  internalApiKey: 'shared-internal-key',
};

function silentLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('buildShellManifest', () => {
  it('produces a payload that the manifest validator accepts', () => {
    const result = validateManifestPayload(buildShellManifest());
    expect(result.ok).toBe(true);
  });

  it('declares no procedures, search adapters, ai tools, uri types, or settings', () => {
    const manifest = buildShellManifest();
    expect(manifest.routes.queries).toEqual([]);
    expect(manifest.routes.mutations).toEqual([]);
    expect(manifest.routes.subscriptions).toEqual([]);
    expect(manifest.search.adapters).toEqual([]);
    expect(manifest.ai.tools).toEqual([]);
    expect(manifest.uri.types).toEqual([]);
    expect(manifest.settings.keys).toEqual([]);
  });
});

describe('registerShellWithRegistry — happy path', () => {
  it('POSTs the canonical register payload to /core.registry.register and reports registered', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          pillarId: SHELL_PILLAR_ID,
          registeredAt: '2026-06-13T13:00:00.000Z',
          heartbeatIntervalMs: 10_000,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const logger = silentLogger();

    const outcome = await registerShellWithRegistry({
      env: VALID_ENV,
      fetch: fetchStub,
      logger,
    });

    expect(outcome).toEqual({
      kind: 'registered',
      pillarId: SHELL_PILLAR_ID,
      registeredAt: '2026-06-13T13:00:00.000Z',
    });

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const call = fetchStub.mock.calls[0] ?? [];
    const url = call[0] as string | URL;
    const init = call[1] as RequestInit | undefined;
    expect(url).toBe('http://core-api:3001/core.registry.register');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json' });

    const sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(sentBody.pillarId).toBe(SHELL_PILLAR_ID);
    expect(sentBody.baseUrl).toBe('https://pops.local');
    expect(sentBody.apiKey).toBe('shared-internal-key');
    expect(sentBody.manifest).toMatchObject({
      pillar: SHELL_PILLAR_ID,
      version: '0.1.0',
      routes: { queries: [], mutations: [], subscriptions: [] },
      search: { adapters: [] },
      ai: { tools: [] },
      uri: { types: [] },
      settings: { keys: [] },
      healthcheck: { path: '/health' },
    });
  });

  it('joins base URL and path cleanly when the base ends in a slash', async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, pillarId: SHELL_PILLAR_ID }), { status: 200 })
      );
    await registerShellWithRegistry({
      env: { ...VALID_ENV, registryBaseUrl: 'http://core-api:3001/' },
      fetch: fetchStub,
      logger: silentLogger(),
    });
    const firstCall = fetchStub.mock.calls[0] ?? [];
    expect(firstCall[0]).toBe('http://core-api:3001/core.registry.register');
  });
});

describe('registerShellWithRegistry — silent skip', () => {
  it('returns skipped + does not call fetch when all env vars are missing', async () => {
    const fetchStub = vi.fn();
    const logger = silentLogger();

    const outcome = await registerShellWithRegistry({
      env: { registryBaseUrl: undefined, shellBaseUrl: undefined, internalApiKey: undefined },
      fetch: fetchStub,
      logger,
    });

    expect(outcome).toEqual({
      kind: 'skipped',
      reason: 'missing-env',
      missing: ['POPS_REGISTRY_URL', 'SHELL_BASE_URL', 'POPS_INTERNAL_API_KEY'],
    });
    expect(fetchStub).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledOnce();
  });

  it.each([
    ['POPS_REGISTRY_URL', { ...VALID_ENV, registryBaseUrl: undefined }],
    ['SHELL_BASE_URL', { ...VALID_ENV, shellBaseUrl: undefined }],
    ['POPS_INTERNAL_API_KEY', { ...VALID_ENV, internalApiKey: undefined }],
  ])('skips when %s alone is missing', async (name, env) => {
    const fetchStub = vi.fn();
    const outcome = await registerShellWithRegistry({
      env,
      fetch: fetchStub,
      logger: silentLogger(),
    });
    expect(outcome.kind).toBe('skipped');
    if (outcome.kind === 'skipped') {
      expect(outcome.missing).toEqual([name]);
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('treats empty strings as missing — defends against unset-but-defined env quirks', async () => {
    const fetchStub = vi.fn();
    const outcome = await registerShellWithRegistry({
      env: { registryBaseUrl: '', shellBaseUrl: '', internalApiKey: '' },
      fetch: fetchStub,
      logger: silentLogger(),
    });
    expect(outcome.kind).toBe('skipped');
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe('registerShellWithRegistry — registry unreachable', () => {
  it('logs a warning and returns unreachable when fetch throws', async () => {
    const boom = new Error('ECONNREFUSED');
    const fetchStub = vi.fn().mockRejectedValue(boom);
    const logger = silentLogger();

    const outcome = await registerShellWithRegistry({
      env: VALID_ENV,
      fetch: fetchStub,
      logger,
    });

    expect(outcome).toEqual({ kind: 'unreachable', error: boom });
    expect(logger.warn).toHaveBeenCalledWith(
      '[shell-registry] registry unreachable — continuing boot',
      boom
    );
  });

  it('returns failed (not unreachable) for a non-2xx response and surfaces the body', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, reason: 'invalid-api-key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );
    const logger = silentLogger();

    const outcome = await registerShellWithRegistry({
      env: VALID_ENV,
      fetch: fetchStub,
      logger,
    });

    expect(outcome).toEqual({
      kind: 'failed',
      status: 401,
      body: { ok: false, reason: 'invalid-api-key' },
    });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('survives a non-JSON failure body without throwing', async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response('upstream offline', { status: 503 }));

    const outcome = await registerShellWithRegistry({
      env: VALID_ENV,
      fetch: fetchStub,
      logger: silentLogger(),
    });

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.status).toBe(503);
      expect(outcome.body).toBeUndefined();
    }
  });
});
