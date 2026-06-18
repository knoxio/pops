/**
 * Tests for the AI providers service (ported from
 * `apps/pops-api/src/modules/core/ai-providers/service.test.ts`).
 *
 * Runs against an in-memory `core.db` opened per-test via `openCoreDb`;
 * the request-scoped drizzle handle is threaded explicitly into every
 * service call. `fetch` is stubbed per-test for the health-check paths.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCoreDb, type CoreDb, type OpenedCoreDb } from '../../../../db/index.js';
import * as service from '../service.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let db: CoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-ai-providers-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  db = coreDb.db;
});

afterEach(() => {
  vi.unstubAllGlobals();
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('listProviders', () => {
  it('returns empty list when no providers exist', () => {
    expect(service.listProviders(db)).toHaveLength(0);
  });

  it('returns providers with their associated models', () => {
    service.upsertProvider(db, {
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

    const providers = service.listProviders(db);
    expect(providers).toHaveLength(1);
    expect(providers[0]?.id).toBe('claude');
    expect(providers[0]?.name).toBe('Anthropic Claude');
    expect(providers[0]?.models).toHaveLength(1);
    expect(providers[0]?.models[0]?.modelId).toBe('claude-haiku-4-5');
  });

  it('returns multiple providers each with their own models', () => {
    service.upsertProvider(db, {
      id: 'claude',
      name: 'Anthropic Claude',
      type: 'cloud',
      models: [{ modelId: 'claude-haiku-4-5', inputCostPerMtok: 0.25, outputCostPerMtok: 1.25 }],
    });
    service.upsertProvider(db, {
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
      models: [
        { modelId: 'llama3', inputCostPerMtok: 0, outputCostPerMtok: 0 },
        { modelId: 'mistral', inputCostPerMtok: 0, outputCostPerMtok: 0 },
      ],
    });

    const providers = service.listProviders(db);
    expect(providers).toHaveLength(2);
    const ollama = providers.find((p) => p.id === 'ollama');
    expect(ollama?.models).toHaveLength(2);
  });
});

describe('runHealthCheck', () => {
  it('returns error when provider does not exist', async () => {
    const result = await service.runHealthCheck(db, 'nonexistent');
    expect(result.status).toBe('error');
    expect(result.error).toBe('Provider not found');
    expect(result.latencyMs).toBe(0);
  });

  it('success path: records status active and latency for a local provider', async () => {
    service.upsertProvider(db, {
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const result = await service.runHealthCheck(db, 'ollama');
    expect(result.status).toBe('active');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();

    const updated = service.getProvider(db, 'ollama');
    expect(updated?.status).toBe('active');
    expect(updated?.lastHealthCheck).not.toBeNull();
    expect(updated?.lastLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('failure path: fetch throws — records status error and error message', async () => {
    service.upsertProvider(db, {
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

    const result = await service.runHealthCheck(db, 'ollama');
    expect(result.status).toBe('error');
    expect(result.error).toBe('Connection refused');

    const updated = service.getProvider(db, 'ollama');
    expect(updated?.status).toBe('error');
    expect(updated?.lastHealthCheck).not.toBeNull();
  });

  it('failure path: non-ok HTTP response records status error', async () => {
    service.upsertProvider(db, {
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await service.runHealthCheck(db, 'ollama');
    expect(result.status).toBe('error');
    expect(result.error).toBe('HTTP 503');
  });
});
