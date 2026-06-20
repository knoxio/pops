/**
 * Integration tests for the `ai-providers.*` REST surface
 * (`core.aiProviders.*`), driven through the real Express app via supertest.
 *
 * Mirrors the legacy tRPC service coverage on the REST transport: upsert
 * (provider + nested model pricing), list, get (including the NULLABLE
 * unknown-id contract — null body, NOT 404), and health checks (success +
 * failure, with `fetch` mocked so no real network is hit). Validation 400 is
 * asserted at the contract boundary (bad type / empty id).
 *
 * Auth gating is intentionally NOT asserted: REST runs under docker-net trust
 * (non-identity domain), so there is no `ctx.user` to bounce on.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-ai-providers-rest-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  vi.restoreAllMocks();
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' })
  );
}

describe('ai-providers — upsert / list / get', () => {
  it('upserts a provider with nested models and reads it back', async () => {
    const created = await client().aiProviders.upsert({
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
      models: [
        {
          modelId: 'llama3:8b',
          displayName: 'Llama 3 8B',
          inputCostPerMtok: 0,
          outputCostPerMtok: 0,
          isDefault: true,
        },
      ],
    });
    expect(created.id).toBe('ollama');
    expect(created.status).toBe('active');
    expect(created.models).toHaveLength(1);
    expect(created.models[0]).toMatchObject({ modelId: 'llama3:8b', isDefault: true });

    const fetched = await client().aiProviders.get('ollama');
    expect(fetched?.id).toBe('ollama');
    expect(fetched?.models[0]?.modelId).toBe('llama3:8b');

    const listed = await client().aiProviders.list();
    expect(listed.map((p) => p.id)).toEqual(['ollama']);
  });

  it('updates a provider in place on a second upsert', async () => {
    await client().aiProviders.upsert({ id: 'claude', name: 'Claude', type: 'cloud' });
    const updated = await client().aiProviders.upsert({
      id: 'claude',
      name: 'Anthropic Claude',
      type: 'cloud',
    });
    expect(updated.name).toBe('Anthropic Claude');

    const listed = await client().aiProviders.list();
    expect(listed).toHaveLength(1);
  });

  it('returns null (not 404) for an unknown provider id', async () => {
    const result = await client().aiProviders.get('nope');
    expect(result).toBeNull();
  });
});

describe('ai-providers — healthCheck', () => {
  it('records active status when the provider responds ok', async () => {
    await client().aiProviders.upsert({
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    const result = await client().aiProviders.healthCheck('ollama');
    expect(result.status).toBe('active');
    expect(result.error).toBeUndefined();

    const provider = await client().aiProviders.get('ollama');
    expect(provider?.status).toBe('active');
    expect(provider?.lastHealthCheck).not.toBeNull();
  });

  it('records error status when the fetch fails', async () => {
    await client().aiProviders.upsert({
      id: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const result = await client().aiProviders.healthCheck('ollama');
    expect(result.status).toBe('error');
    expect(result.error).toContain('Connection refused');

    const provider = await client().aiProviders.get('ollama');
    expect(provider?.status).toBe('error');
  });

  it('returns error for an unknown provider without touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await client().aiProviders.healthCheck('ghost');
    expect(result.status).toBe('error');
    expect(result.error).toBe('Provider not found');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('ai-providers — validation', () => {
  it('400s an unknown provider type at the contract boundary', async () => {
    await expect(
      client().aiProviders.upsert({ id: 'x', name: 'X', type: 'quantum' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s an empty id at the contract boundary', async () => {
    await expect(
      client().aiProviders.upsert({ id: '', name: 'X', type: 'cloud' })
    ).rejects.toMatchObject({ status: 400 });
  });
});
