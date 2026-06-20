/**
 * Offline tests for the embeddings worker handler.
 *
 * Drives `processEmbeddingJob` directly (no BullMQ) against a per-test temp
 * `cerebrum.db` (sqlite-vec loaded so `embeddings_vec` is real), a fake
 * {@link EmbeddingPort} (no network), a fake {@link PeerClients} (no HTTP), and
 * a real {@link EngramService} writing to a temp engram root.
 *
 * Covers: engram + transaction embedding writes (metadata + vec rows), skip on
 * unknown / unavailable source, and content-hash dedup on a re-run.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EngramService } from '../../api/modules/engrams/service.js';
import { TemplateRegistry } from '../../api/modules/templates/registry.js';
import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { processEmbeddingJob, type EmbeddingsHandlerDeps } from '../embeddings-handler.js';

import type { PeerClients } from '../../api/modules/retrieval/peer-clients.js';
import type { EmbeddingPort } from '../embedding-client.js';

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'api',
  'modules',
  'templates',
  'defaults'
);
// The `embeddings_vec` virtual table is fixed at 1536 dims by `openCerebrumDb`,
// so the fake embedder must emit 1536-length vectors or the insert is rejected.
const DIMENSIONS = 1536;

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;
let templates: TemplateRegistry;

function fakeEmbedder(): EmbeddingPort {
  return {
    model: 'fake-embed',
    dimensions: DIMENSIONS,
    embedDocument: vi.fn(async () => Array.from<number>({ length: DIMENSIONS }).fill(0.1)),
  };
}

function makeDeps(overrides: Partial<EmbeddingsHandlerDeps> = {}): EmbeddingsHandlerDeps {
  return {
    db: cerebrumDb.db,
    raw: cerebrumDb.raw,
    vecAvailable: cerebrumDb.vecAvailable,
    engramRoot,
    templates,
    peers: {},
    embedder: fakeEmbedder(),
    ...overrides,
  };
}

function countMetadata(sourceType: string, sourceId: string): number {
  return cerebrumDb.raw
    .prepare('SELECT COUNT(*) FROM embeddings WHERE source_type = ? AND source_id = ?')
    .pluck()
    .get(sourceType, sourceId) as number;
}

function countVectors(): number {
  return cerebrumDb.raw.prepare('SELECT COUNT(*) FROM embeddings_vec').pluck().get() as number;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-worker-embed-db-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-worker-embed-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: true });
  templates = new TemplateRegistry(TEMPLATES_DIR);
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

describe('processEmbeddingJob', () => {
  it('requires sqlite-vec', async () => {
    await expect(
      processEmbeddingJob(makeDeps({ vecAvailable: false }), {
        sourceType: 'engram',
        sourceId: 'x',
      })
    ).rejects.toThrow(/sqlite-vec/);
  });

  it('embeds an engram from the pillar engram store (metadata + vec rows)', async () => {
    const service = new EngramService({ root: engramRoot, db: cerebrumDb.db, templates });
    const engram = service.create({
      type: 'note',
      title: 'Embeddable',
      body: '# Embeddable\n\nThis engram has body text to embed.',
      scopes: ['personal.notes'],
    });

    const deps = makeDeps();
    const result = await processEmbeddingJob(deps, { sourceType: 'engram', sourceId: engram.id });

    expect(result.chunksProcessed).toBe(1);
    expect(result.tokensUsed).toBe(0);
    expect(countMetadata('engram', engram.id)).toBe(1);
    expect(countVectors()).toBe(1);
    expect(deps.embedder.embedDocument).toHaveBeenCalledOnce();
  });

  it('embeds a transaction resolved via the finance peer', async () => {
    const peers: PeerClients = {
      finance: {
        getTransaction: vi.fn(async () => ({
          description: 'Coffee at the corner cafe',
          notes: 'morning fuel',
        })),
        listTransactions: vi.fn(async () => ({ rows: [], hasMore: false })),
      },
    };
    const deps = makeDeps({ peers });

    const result = await processEmbeddingJob(deps, {
      sourceType: 'transaction',
      sourceId: 'txn_1',
    });

    expect(result.chunksProcessed).toBe(1);
    expect(countMetadata('transaction', 'txn_1')).toBe(1);
    expect(countVectors()).toBe(1);
    expect(peers.finance?.getTransaction).toHaveBeenCalledWith('txn_1');
  });

  it('uses inline job content without hitting the source', async () => {
    const deps = makeDeps();
    const result = await processEmbeddingJob(deps, {
      sourceType: 'transaction',
      sourceId: 'txn_inline',
      content: 'Inline content provided by the producer.',
    });

    expect(result.chunksProcessed).toBe(1);
    expect(countMetadata('transaction', 'txn_inline')).toBe(1);
  });

  it('skips an unknown source type (no peer, no crash)', async () => {
    const deps = makeDeps();
    const result = await processEmbeddingJob(deps, { sourceType: 'mystery', sourceId: 'm1' });

    expect(result).toEqual({
      chunksProcessed: 0,
      chunksSkipped: 0,
      chunksDeleted: 0,
      tokensUsed: 0,
    });
    expect(countVectors()).toBe(0);
    expect(deps.embedder.embedDocument).not.toHaveBeenCalled();
  });

  it('skips when the peer is absent for the source type', async () => {
    const deps = makeDeps({ peers: {} });
    const result = await processEmbeddingJob(deps, {
      sourceType: 'transaction',
      sourceId: 'txn_absent',
    });

    expect(result.chunksProcessed).toBe(0);
    expect(countMetadata('transaction', 'txn_absent')).toBe(0);
  });

  it('skips when the peer returns 404 (null record)', async () => {
    const peers: PeerClients = {
      finance: {
        getTransaction: vi.fn(async () => null),
        listTransactions: vi.fn(async () => ({ rows: [], hasMore: false })),
      },
    };
    const result = await processEmbeddingJob(makeDeps({ peers }), {
      sourceType: 'transaction',
      sourceId: 'gone',
    });
    expect(result.chunksProcessed).toBe(0);
    expect(countMetadata('transaction', 'gone')).toBe(0);
  });

  it('dedups by content hash on a re-run (no re-embed)', async () => {
    const deps = makeDeps();
    const job = {
      sourceType: 'transaction' as const,
      sourceId: 'txn_dedup',
      content: 'Stable content that does not change between runs.',
    };

    const first = await processEmbeddingJob(deps, job);
    expect(first.chunksProcessed).toBe(1);

    const second = await processEmbeddingJob(deps, job);
    expect(second.chunksProcessed).toBe(0);
    expect(second.chunksSkipped).toBe(1);
    expect(deps.embedder.embedDocument).toHaveBeenCalledOnce();
    expect(countMetadata('transaction', 'txn_dedup')).toBe(1);
    expect(countVectors()).toBe(1);
  });

  it('re-embeds and updates the vector when content changes', async () => {
    const deps = makeDeps();
    await processEmbeddingJob(deps, {
      sourceType: 'transaction',
      sourceId: 'txn_mut',
      content: 'first version',
    });
    const second = await processEmbeddingJob(deps, {
      sourceType: 'transaction',
      sourceId: 'txn_mut',
      content: 'second different version',
    });

    expect(second.chunksProcessed).toBe(1);
    expect(countMetadata('transaction', 'txn_mut')).toBe(1);
    expect(countVectors()).toBe(1);
  });

  it('deletes existing embeddings when content resolves empty', async () => {
    const deps = makeDeps();
    await processEmbeddingJob(deps, {
      sourceType: 'transaction',
      sourceId: 'txn_clear',
      content: 'will be cleared',
    });
    expect(countMetadata('transaction', 'txn_clear')).toBe(1);

    const cleared = await processEmbeddingJob(deps, {
      sourceType: 'transaction',
      sourceId: 'txn_clear',
      content: '   ',
    });
    expect(cleared.chunksDeleted).toBe(1);
    expect(countMetadata('transaction', 'txn_clear')).toBe(0);
    expect(countVectors()).toBe(0);
  });
});
