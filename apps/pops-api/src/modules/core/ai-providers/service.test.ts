import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupTestContext } from '../../../shared/test-utils.js';
import * as service from './service.js';

const ctx = setupTestContext();

beforeEach(() => {
  ctx.setup();
});

afterEach(() => {
  vi.unstubAllGlobals();
  ctx.teardown();
});

describe('listProviders', () => {
  it('returns empty list when no providers exist', () => {
    expect(service.listProviders()).toHaveLength(0);
  });

  it('returns providers with their associated models', () => {
    service.upsertProvider({
      id: 'claude',
      name: 'Anthropic Claude',
      type: 'cloud',
      models: [
        {
          modelId: 'claude-haiku-4-5',
          displayName: 'Haiku',
          inputCostPerMtok: 0.25,
          outputCostPerMtok: 1.25,
        },
      ],
    });

    const providers = service.listProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0]?.id).toBe('claude');
    expect(providers[0]?.name).toBe('Anthropic Claude');
    expect(providers[0]?.models).toHaveLength(1);
    expect(providers[0]?.models[0]?.modelId).toBe('claude-haiku-4-5');
  });

  it('returns multiple providers each with their own models', () => {
    service.upsertProvider({
      id: 'claude',
      name: 'Anthropic Claude',
      type: 'cloud',
      models: [{ modelId: 'claude-haiku-4-5', inputCostPerMtok: 0.25, outputCostPerMtok: 1.25 }],
    });
    service.upsertProvider({
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
      models: [
        { modelId: 'llama3', inputCostPerMtok: 0, outputCostPerMtok: 0 },
        { modelId: 'mistral', inputCostPerMtok: 0, outputCostPerMtok: 0 },
      ],
    });

    const providers = service.listProviders();
    expect(providers).toHaveLength(2);
    const ollama = providers.find((p) => p.id === 'ollama');
    expect(ollama?.models).toHaveLength(2);
  });
});

describe('runHealthCheck', () => {
  it('returns error when provider does not exist', async () => {
    const result = await service.runHealthCheck('nonexistent');
    expect(result.status).toBe('error');
    expect(result.error).toBe('Provider not found');
    expect(result.latencyMs).toBe(0);
  });

  it('success path: records status active and latency for a local provider', async () => {
    service.upsertProvider({
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const result = await service.runHealthCheck('ollama');
    expect(result.status).toBe('active');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();

    const updated = service.getProvider('ollama');
    expect(updated?.status).toBe('active');
    expect(updated?.lastHealthCheck).not.toBeNull();
    expect(updated?.lastLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('failure path: fetch throws — records status error and error message', async () => {
    service.upsertProvider({
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

    const result = await service.runHealthCheck('ollama');
    expect(result.status).toBe('error');
    expect(result.error).toBe('Connection refused');

    const updated = service.getProvider('ollama');
    expect(updated?.status).toBe('error');
    expect(updated?.lastHealthCheck).not.toBeNull();
  });

  it('failure path: non-ok HTTP response records status error', async () => {
    service.upsertProvider({
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await service.runHealthCheck('ollama');
    expect(result.status).toBe('error');
    expect(result.error).toBe('HTTP 503');
  });
});
