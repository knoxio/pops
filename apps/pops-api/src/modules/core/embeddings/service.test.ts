import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../shared/embedding-client.js', () => ({
  getEmbeddingConfig: vi
    .fn()
    .mockReturnValue({ model: 'text-embedding-3-small', dimensions: 1536 }),
  getEmbedding: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
}));

vi.mock('../../../shared/redis-client.js', () => ({
  getRedis: vi.fn().mockReturnValue(null),
  isRedisAvailable: vi.fn().mockReturnValue(false),
  redisKey: vi.fn((...parts: string[]) => parts.join(':')),
}));

vi.mock('../../../jobs/embed-content.js', () => ({
  embedContent: vi.fn().mockResolvedValue(true),
}));

let testDb: BetterSqlite3.Database;
let vecAvailable = true;

vi.mock('../../../db.js', () => ({
  getDb: () => testDb,
  isVecAvailable: () => vecAvailable,
}));

/**
 * Mocks for the cross-pillar `pillar('cerebrum').embeddings.*` SDK
 * surface (PRD-249). The service flipped off its direct
 * `@pops/cerebrum-db` reads onto these procedures; the tests now
 * stub the proxy-built handle the `pillar('cerebrum')` call returns.
 */
const getStatusStub = vi.fn<(input: { sourceType?: string }) => Promise<unknown>>();
const listSourceIdsByTypeStub = vi.fn<(input: { sourceType: string }) => Promise<unknown>>();

vi.mock('@pops/pillar-sdk/server', () => ({
  pillar: () => ({
    embeddings: {
      getStatus: { orThrow: getStatusStub },
      listSourceIdsByType: { orThrow: listSourceIdsByTypeStub },
    },
  }),
}));

import { semanticSearch, getEmbeddingStatus, reindexEmbeddings } from './service.js';

// ---------------------------------------------------------------------------
// DB setup (semanticSearch uses the in-pillar vec0 path; still backed by
// an in-memory SQLite + a stand-in `embeddings_vec` table because the
// real `sqlite-vec` extension is not present in test env)
// ---------------------------------------------------------------------------

function createSearchTestDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE embeddings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type   TEXT NOT NULL,
      source_id     TEXT NOT NULL,
      chunk_index   INTEGER NOT NULL DEFAULT 0,
      content_hash  TEXT NOT NULL,
      content_preview TEXT NOT NULL,
      model         TEXT NOT NULL,
      dimensions    INTEGER NOT NULL,
      created_at    TEXT NOT NULL,
      UNIQUE (source_type, source_id, chunk_index)
    );

    CREATE TABLE embeddings_vec (
      rowid    INTEGER PRIMARY KEY,
      vector   BLOB NOT NULL,
      distance REAL NOT NULL DEFAULT 0.1
    );
  `);

  return db;
}

function seedEmbedding(
  db: BetterSqlite3.Database,
  sourceType: string,
  sourceId: string,
  preview: string,
  distance = 0.2
): number {
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO embeddings (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES (?, ?, 0, ?, ?, 'test-model', 1536, ?)`
    )
    .run(sourceType, sourceId, `hash-${sourceId}`, preview, now);
  const id = Number(res.lastInsertRowid);
  db.prepare('INSERT INTO embeddings_vec (rowid, vector, distance) VALUES (?, ?, ?)').run(
    id,
    Buffer.alloc(4),
    distance
  );
  return id;
}

beforeEach(() => {
  testDb = createSearchTestDb();
  vecAvailable = true;
  vi.clearAllMocks();
});

afterEach(() => {
  testDb.close();
});

// ---------------------------------------------------------------------------
// semanticSearch — edge cases
// ---------------------------------------------------------------------------

describe('semanticSearch — edge cases', () => {
  it('returns empty array for blank query without calling the embedding API', async () => {
    const { getEmbedding } = await import('../../../shared/embedding-client.js');
    const result = await semanticSearch('   ');
    expect(result).toEqual([]);
    expect(getEmbedding).not.toHaveBeenCalled();
  });

  it('throws VEC_UNAVAILABLE when sqlite-vec extension is not loaded', async () => {
    vecAvailable = false;
    await expect(semanticSearch('find groceries')).rejects.toThrow('Vector features unavailable');
  });
});

// ---------------------------------------------------------------------------
// semanticSearch — correct results from seeded set
// ---------------------------------------------------------------------------

describe('semanticSearch — correct results from seeded embedding set', () => {
  it('returns matching results with correct field mapping', async () => {
    seedEmbedding(testDb, 'transactions', 'tx-1', 'WOOLWORTHS groceries', 0.1);
    seedEmbedding(testDb, 'transactions', 'tx-2', 'NETFLIX subscription', 0.5);

    const originalPrepare = testDb.prepare.bind(testDb);
    vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('MATCH')) {
        return {
          all: (..._args: unknown[]) =>
            testDb
              .prepare(
                'SELECT e.source_type, e.source_id, e.chunk_index, e.content_preview, ev.distance FROM embeddings_vec ev JOIN embeddings e ON e.id = ev.rowid ORDER BY ev.distance'
              )
              .all(),
        } as ReturnType<BetterSqlite3.Database['prepare']>;
      }
      return originalPrepare(sql);
    });

    const results = await semanticSearch('grocery shopping');
    expect(results.length).toBeGreaterThan(0);
    const first = results[0]!;
    expect(first).toHaveProperty('sourceType');
    expect(first).toHaveProperty('sourceId');
    expect(first).toHaveProperty('contentPreview');
    expect(first).toHaveProperty('score');
    expect(first).toHaveProperty('distance');
    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThanOrEqual(1);
  });

  it('filters results beyond the distance threshold', async () => {
    seedEmbedding(testDb, 'transactions', 'tx-close', 'nearby result', 0.1);
    seedEmbedding(testDb, 'transactions', 'tx-far', 'distant result', 0.9);

    const originalPrepare = testDb.prepare.bind(testDb);
    vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('MATCH')) {
        return {
          all: () =>
            testDb
              .prepare(
                'SELECT e.source_type, e.source_id, e.chunk_index, e.content_preview, ev.distance FROM embeddings_vec ev JOIN embeddings e ON e.id = ev.rowid ORDER BY ev.distance'
              )
              .all(),
        } as ReturnType<BetterSqlite3.Database['prepare']>;
      }
      return originalPrepare(sql);
    });

    const results = await semanticSearch('query', { threshold: 0.5 });
    expect(results.every((r) => r.distance <= 0.5)).toBe(true);
    expect(results.some((r) => r.sourceId === 'tx-far')).toBe(false);
  });

  it('filters by sourceType when specified', async () => {
    seedEmbedding(testDb, 'transactions', 'tx-1', 'transaction content', 0.1);
    seedEmbedding(testDb, 'notes', 'note-1', 'note content', 0.2);

    const originalPrepare = testDb.prepare.bind(testDb);
    vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('MATCH')) {
        return {
          all: () =>
            testDb
              .prepare(
                'SELECT e.source_type, e.source_id, e.chunk_index, e.content_preview, ev.distance FROM embeddings_vec ev JOIN embeddings e ON e.id = ev.rowid WHERE e.source_type IN (?) ORDER BY ev.distance'
              )
              .all('transactions'),
        } as ReturnType<BetterSqlite3.Database['prepare']>;
      }
      return originalPrepare(sql);
    });

    const results = await semanticSearch('query', { sourceTypes: ['transactions'] });
    expect(results.every((r) => r.sourceType === 'transactions')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getEmbeddingStatus — now goes through pillar('cerebrum').embeddings
// ---------------------------------------------------------------------------

describe('getEmbeddingStatus (cross-pillar SDK)', () => {
  it('forwards `{}` to cerebrum.embeddings.getStatus when no sourceType given', async () => {
    getStatusStub.mockResolvedValue({ total: 2, pending: 0, stale: 0 });
    const status = await getEmbeddingStatus();
    expect(status).toEqual({ total: 2, pending: 0, stale: 0 });
    expect(getStatusStub).toHaveBeenCalledWith({});
  });

  it('forwards the sourceType filter to cerebrum.embeddings.getStatus', async () => {
    getStatusStub.mockResolvedValue({ total: 1, pending: 0, stale: 0 });
    const status = await getEmbeddingStatus('transactions');
    expect(status).toEqual({ total: 1, pending: 0, stale: 0 });
    expect(getStatusStub).toHaveBeenCalledWith({ sourceType: 'transactions' });
  });

  it('returns zeros when cerebrum reports an unknown source type', async () => {
    getStatusStub.mockResolvedValue({ total: 0, pending: 0, stale: 0 });
    const status = await getEmbeddingStatus('other');
    expect(status).toEqual({ total: 0, pending: 0, stale: 0 });
  });

  it('propagates errors from the SDK call (no fallback to direct cerebrum-db read)', async () => {
    getStatusStub.mockRejectedValue(new Error("Pillar call failed: pillar 'cerebrum' unavailable"));
    await expect(getEmbeddingStatus()).rejects.toThrow(/cerebrum/);
  });
});

// ---------------------------------------------------------------------------
// reindexEmbeddings — now goes through pillar('cerebrum').embeddings
// ---------------------------------------------------------------------------

describe('reindexEmbeddings (cross-pillar SDK)', () => {
  it('enqueues jobs for ids returned by cerebrum.embeddings.listSourceIdsByType', async () => {
    listSourceIdsByTypeStub.mockResolvedValue({ sourceIds: ['tx-1', 'tx-2'] });
    const { embedContent } = await import('../../../jobs/embed-content.js');
    const count = await reindexEmbeddings('transactions');
    expect(count).toBe(2);
    expect(listSourceIdsByTypeStub).toHaveBeenCalledWith({ sourceType: 'transactions' });
    expect(embedContent).toHaveBeenCalledTimes(2);
    expect(embedContent).toHaveBeenCalledWith({ sourceType: 'transactions', sourceId: 'tx-1' });
    expect(embedContent).toHaveBeenCalledWith({ sourceType: 'transactions', sourceId: 'tx-2' });
  });

  it('skips the SDK call when explicit sourceIds are supplied', async () => {
    const { embedContent } = await import('../../../jobs/embed-content.js');
    const count = await reindexEmbeddings('transactions', ['tx-specific']);
    expect(count).toBe(1);
    expect(listSourceIdsByTypeStub).not.toHaveBeenCalled();
    expect(embedContent).toHaveBeenCalledWith({
      sourceType: 'transactions',
      sourceId: 'tx-specific',
    });
  });

  it('returns 0 when the SDK reports no source ids for the type', async () => {
    listSourceIdsByTypeStub.mockResolvedValue({ sourceIds: [] });
    const count = await reindexEmbeddings('no_such_type');
    expect(count).toBe(0);
  });

  it('propagates errors from the SDK call', async () => {
    listSourceIdsByTypeStub.mockRejectedValue(
      new Error("Pillar call failed: pillar 'cerebrum' unavailable")
    );
    await expect(reindexEmbeddings('transactions')).rejects.toThrow(/cerebrum/);
  });
});
