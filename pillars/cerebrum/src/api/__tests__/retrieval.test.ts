/**
 * Integration tests for `cerebrum.retrieval.*` over REST.
 *
 * Seeds `engram_index` + junction + `embeddings` (and, where sqlite-vec is
 * available, `embeddings_vec`) directly via raw SQL against a per-test temp
 * cerebrum.db, then drives search / context / similar / stats through the
 * supertest client.
 *
 * The cross-pillar enrichment rewire is exercised with injected fake
 * {@link PeerClients} returning canned rows — no live peer-api needed. The
 * embedding path is exercised with a fake embedding client — no real provider
 * needed. The no-vec degradation is exercised by opening the db with
 * `loadVec: false`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { makeClient, makeEmptyPeerClients, makeTemplateRegistry } from './test-utils.js';

import type { EmbeddingClient } from '../modules/retrieval/embedding-client.js';
import type { PeerClients } from '../modules/retrieval/peer-clients.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-retrieval-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-retrieval-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: true });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

interface AppOpts {
  db?: OpenedCerebrumDb;
  peers?: PeerClients;
  embeddingClient?: EmbeddingClient;
}

function client(opts: AppOpts = {}) {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb: opts.db ?? cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      engramRoot,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: opts.peers ?? makeEmptyPeerClients(),
      embeddingClient: opts.embeddingClient,
    })
  );
}

interface SeedEngramArgs {
  id: string;
  title: string;
  type?: string;
  status?: string;
  scopes?: string[];
  tags?: string[];
  preview?: string;
  modifiedAt?: string;
}

function seedEngram(db: OpenedCerebrumDb, args: SeedEngramArgs): void {
  const raw = db.raw;
  const modifiedAt = args.modifiedAt ?? '2026-01-01T00:00:00.000Z';
  raw
    .prepare(
      `INSERT INTO engram_index
        (id, file_path, type, source, status, template, created_at, modified_at, title, content_hash, word_count, custom_fields)
       VALUES (?, ?, ?, 'manual', ?, NULL, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      args.id,
      `${args.id}.md`,
      args.type ?? 'note',
      args.status ?? 'active',
      modifiedAt,
      modifiedAt,
      args.title,
      `hash-${args.id}`,
      10
    );
  for (const scope of args.scopes ?? []) {
    raw.prepare('INSERT INTO engram_scopes (engram_id, scope) VALUES (?, ?)').run(args.id, scope);
  }
  for (const tag of args.tags ?? []) {
    raw.prepare('INSERT INTO engram_tags (engram_id, tag) VALUES (?, ?)').run(args.id, tag);
  }
  raw
    .prepare(
      `INSERT INTO embeddings
        (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES ('engram', ?, 0, ?, ?, 'm', 1536, ?)`
    )
    .run(args.id, `hash-${args.id}`, args.preview ?? `preview ${args.title}`, modifiedAt);
}

/**
 * Seed (or reuse) the chunk-0 `embeddings` row for a source and attach a vec
 * vector to it. `unit` selects the dimension set to 1. Engrams already carry an
 * `embeddings` row from {@link seedEngram}, so the insert is ignore-on-conflict
 * and the existing row's id is reused.
 */
function seedVector(
  db: OpenedCerebrumDb,
  sourceType: string,
  sourceId: string,
  unit: number
): void {
  db.raw
    .prepare(
      `INSERT OR IGNORE INTO embeddings
        (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES (?, ?, 0, ?, ?, 'm', 1536, '2026-01-01T00:00:00.000Z')`
    )
    .run(sourceType, sourceId, `hash-${sourceId}`, `preview ${sourceId}`);
  const id = db.raw
    .prepare(
      'SELECT id FROM embeddings WHERE source_type = ? AND source_id = ? AND chunk_index = 0'
    )
    .pluck()
    .get(sourceType, sourceId) as number;
  const vec = new Float32Array(1536);
  vec[unit] = 1;
  db.raw
    .prepare('INSERT INTO embeddings_vec (rowid, vector) VALUES (?, ?)')
    .run(BigInt(id), Buffer.from(vec.buffer));
}

/** A fake embedding client returning a fixed unit vector at index `unit`. */
function fakeEmbeddingClient(unit: number): EmbeddingClient {
  return {
    embedQuery: async () => {
      const v = Array.from<number>({ length: 1536 }).fill(0);
      v[unit] = 1;
      return v;
    },
  };
}

describe('GET /retrieval/stats', () => {
  it('reports indexed + embedded counts, per-source-type breakdown, and last-updated', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_alpha', title: 'Alpha' });
    seedEngram(cerebrumDb, { id: 'eng_20260101_0000_beta', title: 'Beta' });
    seedVector(cerebrumDb, 'transaction', 'txn_1', 5);

    const stats = await client().retrieval.stats();
    expect(stats.indexed).toBe(2);
    expect(stats.embedded).toBe(3);
    expect(stats.sourceTypes['engram']).toBe(2);
    expect(stats.sourceTypes['transaction']).toBe(1);
    expect(stats.lastUpdated).not.toBeNull();
  });

  it('reports zeros on an empty index', async () => {
    const stats = await client().retrieval.stats();
    expect(stats).toEqual({ indexed: 0, embedded: 0, sourceTypes: {}, lastUpdated: null });
  });
});

describe('POST /retrieval/search — structured (BM25)', () => {
  it('filters engrams by scope and returns a total', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_alpha',
      title: 'Alpha',
      scopes: ['work.projects.alpha'],
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_beta',
      title: 'Beta',
      scopes: ['work.projects.beta'],
    });

    const res = await client().retrieval.search({
      mode: 'structured',
      filters: { scopes: ['work.projects.alpha'] },
    });
    expect(res.meta.mode).toBe('structured');
    expect(res.results).toHaveLength(1);
    expect(res.results[0]?.sourceId).toBe('eng_20260101_0000_alpha');
    expect(res.results[0]?.matchType).toBe('structured');
    expect(res.results[0]?.contentPreview).toContain('Alpha');
  });

  it('excludes secret-scoped engrams unless includeSecret is set', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_open',
      title: 'Open',
      scopes: ['work.projects.alpha'],
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_secret',
      title: 'Secret',
      scopes: ['personal.secret.diary'],
    });

    const visible = await client().retrieval.search({
      mode: 'structured',
      filters: { types: ['note'] },
    });
    expect(visible.results.map((r) => r.sourceId)).not.toContain('eng_20260101_0000_secret');

    const withSecret = await client().retrieval.search({
      mode: 'structured',
      filters: { types: ['note'], includeSecret: true },
    });
    expect(withSecret.results.map((r) => r.sourceId)).toContain('eng_20260101_0000_secret');
  });

  it('400s on structured mode with no filter', async () => {
    await expect(client().retrieval.search({ mode: 'structured' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('400s on semantic/hybrid mode with no query', async () => {
    await expect(client().retrieval.search({ mode: 'semantic' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(client().retrieval.search({ mode: 'hybrid' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('POST /retrieval/search — semantic + cross-pillar enrichment', () => {
  it('embeds the query, kNN-matches a cross-pillar hit, and enriches it via the peer client', async () => {
    seedVector(cerebrumDb, 'transaction', 'txn_42', 0);

    const peers: PeerClients = {
      finance: {
        getTransaction: async (id) => {
          expect(id).toBe('txn_42');
          return {
            description: 'Coffee at Blue Bottle',
            entityName: 'Blue Bottle',
            tags: ['coffee'],
            notes: 'morning',
          };
        },
      },
    };

    const res = await client({ peers, embeddingClient: fakeEmbeddingClient(0) }).retrieval.search({
      mode: 'semantic',
      query: 'coffee',
    });

    expect(res.results).toHaveLength(1);
    const hit = res.results[0];
    expect(hit?.sourceType).toBe('transaction');
    expect(hit?.sourceId).toBe('txn_42');
    expect(hit?.title).toBe('Coffee at Blue Bottle');
    expect(hit?.matchType).toBe('semantic');
    expect(String(hit?.metadata['text'])).toContain('Blue Bottle');
  });

  it('drops a cross-pillar hit when its peer is absent from the registry', async () => {
    seedVector(cerebrumDb, 'movie', '99', 0);

    // No `media` peer client → enrichment unavailable → hit dropped, no crash.
    const res = await client({
      peers: makeEmptyPeerClients(),
      embeddingClient: fakeEmbeddingClient(0),
    }).retrieval.search({ mode: 'semantic', query: 'film' });

    expect(res.results).toHaveLength(0);
  });

  it('returns no semantic results when no embedding client is configured', async () => {
    seedVector(cerebrumDb, 'transaction', 'txn_1', 0);
    const res = await client().retrieval.search({ mode: 'semantic', query: 'anything' });
    expect(res.results).toHaveLength(0);
  });
});

describe('POST /retrieval/search — hybrid degradation', () => {
  it('falls back to BM25-only when the db has no vec support', async () => {
    const noVecDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-retrieval-novec-'));
    const noVecDb = openCerebrumDb(join(noVecDir, 'cerebrum.db'), { loadVec: false });
    expect(noVecDb.vecAvailable).toBe(false);
    seedEngram(noVecDb, {
      id: 'eng_20260101_0000_alpha',
      title: 'Alpha',
      scopes: ['work.projects.alpha'],
      tags: ['x'],
    });

    try {
      // Hybrid with an embedding client but no vec → semantic leg throws
      // vec-unavailable, hybrid swallows it, BM25 leg still returns the engram.
      const res = await client({
        db: noVecDb,
        embeddingClient: fakeEmbeddingClient(0),
      }).retrieval.search({ mode: 'hybrid', query: 'alpha', filters: { tags: ['x'] } });
      expect(res.results.map((r) => r.sourceId)).toContain('eng_20260101_0000_alpha');
    } finally {
      noVecDb.raw.close();
      rmSync(noVecDir, { recursive: true, force: true });
    }
  });
});

describe('POST /retrieval/similar', () => {
  it('returns the other engrams sharing the query engram vector, excluding itself', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_self',
      title: 'Self',
      scopes: ['work.projects.alpha'],
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_other',
      title: 'Other',
      scopes: ['work.projects.alpha'],
    });
    seedVector(cerebrumDb, 'engram', 'eng_20260101_0000_self', 0);
    seedVector(cerebrumDb, 'engram', 'eng_20260101_0000_other', 0);

    const res = await client().retrieval.similar({ engramId: 'eng_20260101_0000_self' });
    const ids = res.results.map((r) => r.sourceId);
    expect(ids).toContain('eng_20260101_0000_other');
    expect(ids).not.toContain('eng_20260101_0000_self');
  });

  it('returns an empty list for an engram with no vector', async () => {
    const res = await client().retrieval.similar({ engramId: 'eng_20260101_0000_missing' });
    expect(res.results).toEqual([]);
  });
});

describe('POST /retrieval/context', () => {
  it('assembles a token-budgeted context window with source attribution', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0000_alpha',
      title: 'Alpha',
      scopes: ['work.projects.alpha'],
      tags: ['ctx'],
      preview: 'The alpha engram body for context.',
    });

    const res = await client().retrieval.context({
      query: 'alpha',
      filters: { tags: ['ctx'] },
      tokenBudget: 2048,
    });
    expect(res.context).toContain('Query: alpha');
    expect(res.context).toContain('Alpha');
    expect(res.sources.map((s) => s.sourceId)).toContain('eng_20260101_0000_alpha');
    expect(res.truncated).toBe(false);
    expect(res.tokenEstimate).toBeGreaterThan(0);
  });

  it('400s on an empty query', async () => {
    await expect(client().retrieval.context({ query: '   ' })).rejects.toMatchObject({
      status: 400,
    });
  });
});
