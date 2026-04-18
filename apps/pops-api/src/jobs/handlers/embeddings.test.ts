import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as dbTypes from '@pops/db-types';

// ---------------------------------------------------------------------------
// Mocks — all must appear before the subject import
// ---------------------------------------------------------------------------

vi.mock('../../shared/embedding-client.js', () => ({
  getEmbeddingConfig: vi
    .fn()
    .mockReturnValue({ model: 'text-embedding-3-small', dimensions: 1536 }),
  getEmbedding: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
  estimateEmbeddingCost: vi.fn().mockReturnValue(0.0001),
}));

vi.mock('../../shared/redis-client.js', () => ({
  getRedis: vi.fn().mockReturnValue(null),
  isRedisAvailable: vi.fn().mockReturnValue(false),
  redisKey: vi.fn((...parts: string[]) => parts.join(':')),
}));

let testDb: BetterSqlite3.Database;
let testDrizzle: ReturnType<typeof drizzle>;
let vecAvailable = true;

vi.mock('../../db.js', () => ({
  getDrizzle: () => testDrizzle,
  getDb: () => testDb,
  isVecAvailable: () => vecAvailable,
  setDb: vi.fn(),
  closeDb: vi.fn(),
}));

import { processEmbeddingJob } from './embeddings.js';

// ---------------------------------------------------------------------------
// DB setup helpers
// ---------------------------------------------------------------------------

function createEmbeddingsTestDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE transactions (
      id   TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      notes TEXT
    );

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

    CREATE TABLE ai_usage (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      description   TEXT NOT NULL,
      entity_name   TEXT,
      category      TEXT,
      input_tokens  INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_usd      REAL NOT NULL,
      cached        INTEGER NOT NULL DEFAULT 0,
      import_batch_id TEXT,
      created_at    TEXT NOT NULL
    );

    -- Simulated embeddings_vec table (no sqlite-vec extension needed in tests)
    CREATE TABLE embeddings_vec (
      rowid  INTEGER PRIMARY KEY,
      vector BLOB NOT NULL
    );
  `);

  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  testDb = createEmbeddingsTestDb();
  testDrizzle = drizzle(testDb, { schema: dbTypes });
  vecAvailable = true;
});

afterEach(() => {
  testDb.close();
  vi.clearAllMocks();
});

describe('processEmbeddingJob — basic flow', () => {
  it('throws when sqlite-vec is not available', async () => {
    vecAvailable = false;
    await expect(
      processEmbeddingJob({ sourceType: 'transactions', sourceId: 'tx-1', content: 'hello' })
    ).rejects.toThrow('sqlite-vec extension not available');
  });

  it('returns zero counts and no-ops when content is empty', async () => {
    const result = await processEmbeddingJob({
      sourceType: 'transactions',
      sourceId: 'tx-empty',
      content: '   ',
    });
    expect(result).toEqual({ chunksProcessed: 0, chunksSkipped: 0, chunksDeleted: 0 });
  });

  it('processes content and stores an embedding row + vector', async () => {
    const result = await processEmbeddingJob({
      sourceType: 'transactions',
      sourceId: 'tx-1',
      content: 'WOOLWORTHS 1234',
    });

    expect(result.chunksProcessed).toBe(1);
    expect(result.chunksSkipped).toBe(0);

    const row = testDb.prepare('SELECT * FROM embeddings WHERE source_id = ?').get('tx-1') as
      | {
          source_type: string;
          chunk_index: number;
          model: string;
        }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.source_type).toBe('transactions');
    expect(row?.chunk_index).toBe(0);
    expect(row?.model).toBe('text-embedding-3-small');

    const vecRow = testDb
      .prepare('SELECT rowid FROM embeddings_vec WHERE rowid = ?')
      .get((row as unknown as { id: number }).id);
    expect(vecRow).toBeDefined();
  });

  it('tracks AI usage when embedding API is called', async () => {
    await processEmbeddingJob({
      sourceType: 'transactions',
      sourceId: 'tx-2',
      content: 'NETFLIX monthly subscription',
    });

    const usage = testDb.prepare("SELECT * FROM ai_usage WHERE category = 'embeddings'").get() as
      | { input_tokens: number; cost_usd: number }
      | undefined;
    expect(usage).toBeDefined();
    expect(usage?.input_tokens).toBeGreaterThan(0);
    expect(usage?.cost_usd).toBeGreaterThan(0);
  });
});

describe('processEmbeddingJob — idempotency (skip unchanged)', () => {
  it('skips re-embedding when content has not changed', async () => {
    const content = 'Unchanged transaction description';

    await processEmbeddingJob({ sourceType: 'transactions', sourceId: 'tx-3', content });
    const { getEmbedding } = await import('../../shared/embedding-client.js');
    vi.mocked(getEmbedding).mockClear();

    const result = await processEmbeddingJob({
      sourceType: 'transactions',
      sourceId: 'tx-3',
      content,
    });
    expect(result.chunksSkipped).toBe(1);
    expect(result.chunksProcessed).toBe(0);
    expect(getEmbedding).not.toHaveBeenCalled();
  });

  it('re-embeds when content changes', async () => {
    await processEmbeddingJob({
      sourceType: 'transactions',
      sourceId: 'tx-4',
      content: 'original text',
    });
    const { getEmbedding } = await import('../../shared/embedding-client.js');
    vi.mocked(getEmbedding).mockClear();

    const result = await processEmbeddingJob({
      sourceType: 'transactions',
      sourceId: 'tx-4',
      content: 'updated text — now different',
    });
    expect(result.chunksProcessed).toBe(1);
    expect(getEmbedding).toHaveBeenCalledTimes(1);
  });
});

describe('processEmbeddingJob — orphan cleanup', () => {
  it('deletes orphaned chunks when content shrinks', async () => {
    const { chunkText } = await import('../../shared/chunker.js');

    // Seed two embedding rows simulating a previous 2-chunk document
    const now = new Date().toISOString();
    const ids = testDb
      .prepare(
        `INSERT INTO embeddings (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'transactions',
        'tx-5',
        0,
        'old-hash-0',
        'preview 0',
        'text-embedding-3-small',
        1536,
        now
      );

    testDb
      .prepare(
        `INSERT INTO embeddings (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'transactions',
        'tx-5',
        1,
        'old-hash-1',
        'preview 1',
        'text-embedding-3-small',
        1536,
        now
      );

    // Also seed the embeddings_vec rows
    testDb
      .prepare('INSERT INTO embeddings_vec (rowid, vector) VALUES (?, ?)')
      .run(ids.lastInsertRowid, Buffer.alloc(4));

    // Now process with short content that produces only 1 chunk
    const shortContent = 'short text';
    expect(chunkText(shortContent)).toHaveLength(1);

    const result = await processEmbeddingJob({
      sourceType: 'transactions',
      sourceId: 'tx-5',
      content: shortContent,
    });

    expect(result.chunksDeleted).toBe(1);

    const remaining = testDb
      .prepare('SELECT count(*) as cnt FROM embeddings WHERE source_id = ?')
      .get('tx-5') as { cnt: number };
    expect(remaining.cnt).toBe(1);
  });
});

describe('processEmbeddingJob — source lookup', () => {
  it('fetches content from transactions table when no inline content is provided', async () => {
    testDb
      .prepare('INSERT INTO transactions (id, description, notes) VALUES (?, ?, ?)')
      .run('tx-db', 'ALDI STORE 42', 'weekly groceries');

    const result = await processEmbeddingJob({ sourceType: 'transactions', sourceId: 'tx-db' });
    expect(result.chunksProcessed).toBe(1);
  });

  it('no-ops for unknown source types with no inline content', async () => {
    const result = await processEmbeddingJob({
      sourceType: 'unknown_source_type',
      sourceId: 'id-1',
    });
    expect(result).toEqual({ chunksProcessed: 0, chunksSkipped: 0, chunksDeleted: 0 });
  });
});
