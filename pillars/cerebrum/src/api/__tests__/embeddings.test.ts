/**
 * Integration tests for `cerebrum.embeddings.*` over REST.
 *
 * Boots the app against a per-test temp `cerebrum.db` and seeds `embeddings`
 * rows directly through the drizzle handle. Covers `getStatus` (total + optional
 * source-type filter) and `listSourceIdsByType` (distinct ids).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type CerebrumDb,
  embeddings,
  openCerebrumDb,
  type OpenedCerebrumDb,
} from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import {
  makeClient,
  makeEmptyPeerClients,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

import type { TemplateRegistry } from '../modules/templates/registry.js';

interface SeedEmbedding {
  sourceType: string;
  sourceId: string;
  chunkIndex?: number;
}

function seedEmbedding(db: CerebrumDb, e: SeedEmbedding): void {
  db.insert(embeddings)
    .values({
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      chunkIndex: e.chunkIndex ?? 0,
      contentHash: `${e.sourceType}:${e.sourceId}:${e.chunkIndex ?? 0}`,
      contentPreview: 'preview',
      model: 'fake-embed',
      dimensions: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    .run();
}

let tmpDir: string;
let engramRoot: string;
let templateRegistry: TemplateRegistry;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-embeddings-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-embeddings-root-'));
  templateRegistry = makeTemplateRegistry();
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry,
      engramRoot,
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
    })
  );
}

describe('cerebrum.embeddings.getStatus', () => {
  it('returns zero total on an empty table with pending/stale held at 0', async () => {
    const status = await client().embeddings.getStatus();
    expect(status).toEqual({ total: 0, pending: 0, stale: 0 });
  });

  it('counts every row when no source type is supplied', async () => {
    const db = cerebrumDb.db;
    seedEmbedding(db, { sourceType: 'engram', sourceId: 'a' });
    seedEmbedding(db, { sourceType: 'engram', sourceId: 'b' });
    seedEmbedding(db, { sourceType: 'note', sourceId: 'c' });

    const status = await client().embeddings.getStatus();
    expect(status).toEqual({ total: 3, pending: 0, stale: 0 });
  });

  it('scopes the count to the requested source type', async () => {
    const db = cerebrumDb.db;
    seedEmbedding(db, { sourceType: 'engram', sourceId: 'a' });
    seedEmbedding(db, { sourceType: 'engram', sourceId: 'b' });
    seedEmbedding(db, { sourceType: 'note', sourceId: 'c' });

    const status = await client().embeddings.getStatus('engram');
    expect(status).toEqual({ total: 2, pending: 0, stale: 0 });
  });
});

describe('cerebrum.embeddings.listSourceIdsByType', () => {
  it('returns the distinct source ids for a source type', async () => {
    const db = cerebrumDb.db;
    seedEmbedding(db, { sourceType: 'engram', sourceId: 'a', chunkIndex: 0 });
    seedEmbedding(db, { sourceType: 'engram', sourceId: 'a', chunkIndex: 1 });
    seedEmbedding(db, { sourceType: 'engram', sourceId: 'b' });
    seedEmbedding(db, { sourceType: 'note', sourceId: 'c' });

    const { sourceIds } = await client().embeddings.listSourceIdsByType('engram');
    expect(sourceIds.toSorted()).toEqual(['a', 'b']);
  });

  it('returns an empty list for a source type with no rows', async () => {
    const { sourceIds } = await client().embeddings.listSourceIdsByType('absent');
    expect(sourceIds).toEqual([]);
  });
});
