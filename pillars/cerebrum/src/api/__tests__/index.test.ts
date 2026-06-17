/**
 * Integration tests for `cerebrum.index.*` (thalamus) over REST.
 *
 * Boots the app against a per-test temp cerebrum.db + temp engram root with NO
 * Redis (the embeddings-queue accessor is injected, either `() => null` for the
 * soft no-queue path or a recording fake that captures `add` calls). The
 * watcher is never started, so `status` reports `watching: false`.
 * `reindexSources` is exercised with fully-injected fake peer clients so no real
 * cross-pillar HTTP is ever made.
 */
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { embeddings, openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { hashContent } from '../modules/thalamus/chunker.js';
import { makeClient, makeReflexService, makeTemplateRegistry } from './test-utils.js';

import type { Queue } from 'bullmq';

import type {
  FinanceTransactionListRow,
  InventoryItemListRow,
  MediaMovieListRow,
  MediaTvShowListRow,
  PeerClients,
  PeerPage,
} from '../modules/retrieval/peer-clients.js';
import type { EmbeddingJobData, EmbeddingsQueueAccessor } from '../modules/thalamus/queue.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-index-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-index-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

interface RecordingQueue {
  accessor: EmbeddingsQueueAccessor;
  jobs: EmbeddingJobData[];
}

/**
 * A queue accessor that records every `add` payload without touching Redis. The
 * recorded jobs let tests assert exactly which source rows / engrams were
 * enqueued. Only `add` is exercised by the index procs; `getJobCounts` is
 * stubbed so `status` can read a pending count.
 */
function recordingQueue(pending = 0): RecordingQueue {
  const jobs: EmbeddingJobData[] = [];
  const fake = {
    add: (_name: string, data: EmbeddingJobData) => {
      jobs.push(data);
      return Promise.resolve({ id: String(jobs.length) });
    },
    getJobCounts: () => Promise.resolve({ waiting: pending, active: 0, delayed: 0 }),
  } as unknown as Queue<EmbeddingJobData>;
  return { accessor: () => fake, jobs };
}

const NULL_QUEUE: EmbeddingsQueueAccessor = () => null;

function client(
  opts: {
    queueAccessor?: EmbeddingsQueueAccessor;
    peerClients?: PeerClients;
  } = {}
) {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      engramRoot,
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      curationQueue: () => null,
      embeddingsQueue: opts.queueAccessor ?? NULL_QUEUE,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: opts.peerClients ?? {},
    })
  );
}

const ISO = '2026-06-17T00:00:00.000Z';

function writeEngramFile(relPath: string, id: string, body: string, scope = 'work'): void {
  const content = [
    '---',
    `id: ${id}`,
    'type: note',
    `scopes:\n  - ${scope}`,
    `created: ${ISO}`,
    `modified: ${ISO}`,
    'source: manual',
    'status: active',
    '---',
    '',
    body,
    '',
  ].join('\n');
  writeFileSync(join(engramRoot, relPath), content, 'utf8');
}

describe('GET /index/status', () => {
  it('reports watching:false and a null pending count without Redis', async () => {
    const status = await client().index.status();
    expect(status.watcher).toEqual({ watching: false, lastEventAt: null, watchedPaths: 0 });
    expect(status.embeddingsQueue.name).toBe('pops-embeddings');
    expect(status.embeddingsQueue.pendingCount).toBeNull();
  });

  it('surfaces the queue pending count when a producer is present', async () => {
    const queue = recordingQueue(7);
    const status = await client({ queueAccessor: queue.accessor }).index.status();
    expect(status.embeddingsQueue.pendingCount).toBe(7);
  });
});

describe('POST /index/reindex', () => {
  it('rebuilds the index from disk and reports enqueued:0 without Redis', async () => {
    writeEngramFile('a.md', 'eng_20260617_0000_alpha', '# Alpha\n\nfirst body');
    writeEngramFile('b.md', 'eng_20260617_0000_beta', '# Beta\n\nsecond body');

    const result = await client().index.reindex();
    expect(result.indexed).toBe(2);
    expect(result.enqueued).toBe(0);

    // The fs→index sync is observable: the engrams now resolve through search.
    const found = await client().engrams.search({});
    expect(found.total).toBe(2);
  });

  it('enqueues embeddings for every non-empty engram when force is set', async () => {
    writeEngramFile('a.md', 'eng_20260617_0000_alpha', '# Alpha\n\nfirst body');
    writeEngramFile('empty.md', 'eng_20260617_0000_empty', '   ');
    const queue = recordingQueue();

    const result = await client({ queueAccessor: queue.accessor }).index.reindex(true);
    expect(result.indexed).toBe(2);
    // Only the engram with a non-empty body is enqueued (empty body is skipped).
    expect(result.enqueued).toBe(1);
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]).toMatchObject({
      sourceType: 'engram',
      sourceId: 'eng_20260617_0000_alpha',
    });
  });

  it('force-reindex with no Redis still rebuilds and reports enqueued:0', async () => {
    writeEngramFile('a.md', 'eng_20260617_0000_alpha', '# Alpha\n\nbody');
    const result = await client().index.reindex(true);
    expect(result.indexed).toBe(1);
    expect(result.enqueued).toBe(0);
  });
});

describe('POST /index/reconcile', () => {
  it('detects a file on disk that is missing from the index (dryRun)', async () => {
    writeEngramFile('orphan-on-disk.md', 'eng_20260617_0000_disk', '# Disk only\n\nbody');

    const result = await client().index.reconcile(true);
    expect(result.dryRun).toBe(true);
    expect(result.missing).toEqual(['orphan-on-disk.md']);
    expect(result.orphaned).toEqual([]);

    // dryRun must not mutate the index.
    const found = await client().engrams.search({});
    expect(found.total).toBe(0);
  });

  it('applies the sync for missing files when not a dryRun', async () => {
    writeEngramFile('new.md', 'eng_20260617_0000_new', '# New\n\nbody');

    const result = await client().index.reconcile(false);
    expect(result.missing).toEqual(['new.md']);

    const found = await client().engrams.search({});
    expect(found.total).toBe(1);

    // A second reconcile finds nothing missing — the first one persisted it.
    const again = await client().index.reconcile(true);
    expect(again.missing).toEqual([]);
  });

  it('detects an indexed engram whose file was deleted as orphaned', async () => {
    writeEngramFile('gone.md', 'eng_20260617_0000_gone', '# Gone\n\nbody');
    await client().index.reindex();

    unlinkSync(join(engramRoot, 'gone.md'));

    const result = await client().index.reconcile(false);
    expect(result.orphaned).toEqual(['gone.md']);

    // A re-run sees no orphans (the first marked it orphaned).
    const again = await client().index.reconcile(true);
    expect(again.orphaned).toEqual([]);
  });

  it('returns empty discrepancies when disk and index agree', async () => {
    writeEngramFile('agree.md', 'eng_20260617_0000_agree', '# Agree\n\nbody');
    await client().index.reindex();

    const result = await client().index.reconcile(true);
    expect(result.missing).toEqual([]);
    expect(result.orphaned).toEqual([]);
  });
});

describe('POST /index/reindex-sources', () => {
  function singlePage<T>(rows: T[]): PeerPage<T> {
    return { rows, hasMore: false };
  }

  function fakePeers(): PeerClients {
    const tx: FinanceTransactionListRow = {
      id: 'tx-1',
      description: 'Coffee',
      entityName: 'Cafe',
      tags: ['food'],
      notes: null,
    };
    const movie: MediaMovieListRow = { id: 42, title: 'Dune', overview: 'Sand', genres: ['scifi'] };
    const show: MediaTvShowListRow = { id: 7, name: 'Severance', overview: 'Office', genres: [] };
    const item: InventoryItemListRow = {
      id: 'item-1',
      itemName: 'Drill',
      brand: 'Bosch',
      type: 'tool',
      location: 'Garage',
    };
    return {
      finance: {
        getTransaction: () => Promise.resolve(null),
        listTransactions: () => Promise.resolve(singlePage([tx])),
      },
      media: {
        getMovie: () => Promise.resolve(null),
        getTvShow: () => Promise.resolve(null),
        listMovies: () => Promise.resolve(singlePage([movie])),
        listTvShows: () => Promise.resolve(singlePage([show])),
      },
      inventory: {
        getItem: () => Promise.resolve(null),
        listItems: () => Promise.resolve(singlePage([item])),
      },
    };
  }

  it('enqueues one job per changed peer row across all source types', async () => {
    const queue = recordingQueue();
    const result = await client({
      queueAccessor: queue.accessor,
      peerClients: fakePeers(),
    }).index.reindexSources();

    expect(result.sourceTypes).toEqual(['transaction', 'movie', 'tv_show', 'inventory']);
    expect(result.enqueued).toBe(4);
    expect(queue.jobs.map((j) => j.sourceType).toSorted()).toEqual([
      'inventory',
      'movie',
      'transaction',
      'tv_show',
    ]);
    const tx = queue.jobs.find((j) => j.sourceType === 'transaction');
    expect(tx?.sourceId).toBe('tx-1');
    expect(tx?.content).toContain('Coffee');
  });

  it('honours an explicit subset and ignores unknown source types', async () => {
    const queue = recordingQueue();
    const result = await client({
      queueAccessor: queue.accessor,
      peerClients: fakePeers(),
    }).index.reindexSources(['movie', 'bogus']);

    expect(result.sourceTypes).toEqual(['movie']);
    expect(result.enqueued).toBe(1);
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.sourceType).toBe('movie');
  });

  it('skips a source row whose first-chunk hash is unchanged', async () => {
    // Seed the embeddings table with the exact hash the movie row would produce.
    const movieText = 'Title: Dune\nOverview: Sand\nGenres: scifi';
    cerebrumDb.db
      .insert(embeddings)
      .values({
        sourceType: 'movie',
        sourceId: '42',
        chunkIndex: 0,
        contentHash: hashContent(movieText),
        contentPreview: movieText.slice(0, 50),
        model: 'fake',
        dimensions: 3,
        createdAt: ISO,
      })
      .run();

    const queue = recordingQueue();
    const result = await client({
      queueAccessor: queue.accessor,
      peerClients: fakePeers(),
    }).index.reindexSources(['movie']);

    expect(result.enqueued).toBe(0);
    expect(queue.jobs).toHaveLength(0);
  });

  it('skips a source type whose peer is absent (enqueued:0, no crash)', async () => {
    const queue = recordingQueue();
    const result = await client({
      queueAccessor: queue.accessor,
      peerClients: {},
    }).index.reindexSources(['transaction', 'movie']);

    expect(result.enqueued).toBe(0);
    expect(queue.jobs).toHaveLength(0);
  });

  it('reports enqueued:0 without Redis even when peers return rows', async () => {
    const result = await client({
      queueAccessor: NULL_QUEUE,
      peerClients: fakePeers(),
    }).index.reindexSources();
    expect(result.enqueued).toBe(0);
  });
});
