/**
 * Integration tests for `cerebrum.plexus.*` over REST.
 *
 * Boots the app against a per-test temp cerebrum.db and exercises adapter reads,
 * the filter set/list round-trip, and the 400 / 404 error paths through
 * supertest. Adapters are seeded directly via the `plexusService` SQL seam — the
 * lifecycle/TOML registry is not exercised here.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, plexusService, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { makeClient, makeEmptyPeerClients, makeTemplateRegistry } from './test-utils.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-plexus-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
    })
  );
}

function seedAdapter(id: string, name: string): void {
  const now = new Date().toISOString();
  plexusService.upsertAdapter(cerebrumDb.db, {
    id,
    name,
    config: { foo: 'bar' },
    createdAt: now,
    updatedAt: now,
  });
}

describe('GET /plexus/adapters', () => {
  it('returns an empty list on a fresh database', async () => {
    const { adapters } = await client().plexus.listAdapters();
    expect(adapters).toEqual([]);
  });

  it('lists seeded adapters ordered by name', async () => {
    seedAdapter('plx_zeta', 'zeta');
    seedAdapter('plx_alpha', 'alpha');
    const { adapters } = await client().plexus.listAdapters();
    expect(adapters.map((a) => a.name)).toEqual(['alpha', 'zeta']);
    const alpha = adapters.find((a) => a.name === 'alpha');
    expect(alpha?.status).toBe('registered');
    expect(alpha?.config).toEqual({ foo: 'bar' });
  });
});

describe('GET /plexus/adapters/:adapterId', () => {
  it('returns a seeded adapter', async () => {
    seedAdapter('plx_email', 'email');
    const { adapter } = await client().plexus.getAdapter('plx_email');
    expect(adapter.id).toBe('plx_email');
    expect(adapter.name).toBe('email');
  });

  it('404s on an unknown adapter', async () => {
    await expect(client().plexus.getAdapter('plx_missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('GET /plexus/adapters/:adapterId/filters', () => {
  it('returns an empty list for an adapter with no filters', async () => {
    seedAdapter('plx_github', 'github');
    const { filters } = await client().plexus.listFilters('plx_github');
    expect(filters).toEqual([]);
  });
});

describe('POST /plexus/adapters/:adapterId/filters', () => {
  it('404s when the adapter does not exist', async () => {
    await expect(
      client().plexus.setFilters('plx_missing', [
        { filterType: 'include', field: 'title', pattern: '.*' },
      ])
    ).rejects.toMatchObject({ status: 404 });
  });

  it('400s on an invalid regex pattern', async () => {
    seedAdapter('plx_email', 'email');
    await expect(
      client().plexus.setFilters('plx_email', [
        { filterType: 'exclude', field: 'subject', pattern: '[unterminated' },
      ])
    ).rejects.toMatchObject({ status: 400 });
  });

  it('replaces and reads back the filter set (round-trip)', async () => {
    seedAdapter('plx_email', 'email');
    const written = await client().plexus.setFilters('plx_email', [
      { filterType: 'include', field: 'subject', pattern: '^\\[urgent\\]' },
      { filterType: 'exclude', field: 'from', pattern: 'noreply@', enabled: false },
    ]);
    expect(written.filters).toHaveLength(2);
    expect(written.filters[0]).toMatchObject({
      adapterId: 'plx_email',
      filterType: 'include',
      field: 'subject',
      pattern: '^\\[urgent\\]',
      enabled: true,
    });
    expect(written.filters[1]).toMatchObject({ filterType: 'exclude', enabled: false });

    const { filters: readBack } = await client().plexus.listFilters('plx_email');
    expect(readBack).toEqual(written.filters);

    const replaced = await client().plexus.setFilters('plx_email', [
      { filterType: 'include', field: 'subject', pattern: 'newsletter' },
    ]);
    expect(replaced.filters).toHaveLength(1);
    expect(replaced.filters[0]?.pattern).toBe('newsletter');
  });
});

describe('POST /plexus/adapters/:adapterId/health-check', () => {
  it('reports error for an adapter not active in the lifecycle manager', async () => {
    seedAdapter('plx_email', 'email');
    const result = await client().plexus.healthCheck('plx_email');
    expect(result.status).toBe('error');
    expect(result.error).toContain('not active');
  });
});

describe('POST /plexus/adapters/:adapterId/unregister', () => {
  it('hard-deletes a seeded adapter row even when it is not lifecycle-active', async () => {
    seedAdapter('plx_email', 'email');
    const { success } = await client().plexus.unregister('plx_email');
    expect(success).toBe(true);
    await expect(client().plexus.getAdapter('plx_email')).rejects.toMatchObject({ status: 404 });
  });

  it('returns success=false when the adapter is already gone', async () => {
    const { success } = await client().plexus.unregister('plx_missing');
    expect(success).toBe(false);
  });
});
