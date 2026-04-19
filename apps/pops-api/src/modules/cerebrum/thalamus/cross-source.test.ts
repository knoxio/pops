/**
 * CrossSourceIndexer tests.
 *
 * Tests the pure formatter functions and the scanAndEnqueue logic with a real
 * in-memory SQLite database and a mocked BullMQ queue.
 */
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CrossSourceIndexer,
  toInventoryText,
  toMovieText,
  toTransactionText,
  toTvShowText,
} from './cross-source.js';

import type { Database } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Mock the queues module
// ---------------------------------------------------------------------------

const mockAdd = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'job-1' }));
const mockGetEmbeddingsQueue = vi.hoisted(() => vi.fn().mockReturnValue({ add: mockAdd }));

vi.mock('../../../jobs/queues.js', () => ({
  getEmbeddingsQueue: mockGetEmbeddingsQueue,
  EMBEDDINGS_QUEUE: 'pops:embeddings',
  EMBEDDINGS_JOB_OPTIONS: {},
}));

// ---------------------------------------------------------------------------
// Minimal in-memory DB with just the tables CrossSourceIndexer needs
// ---------------------------------------------------------------------------

function createCrossSourceTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id        TEXT,
      description      TEXT NOT NULL,
      account          TEXT NOT NULL DEFAULT '',
      amount           REAL NOT NULL DEFAULT 0,
      date             TEXT NOT NULL DEFAULT '',
      type             TEXT NOT NULL DEFAULT '',
      tags             TEXT NOT NULL DEFAULT '',
      entity_id        TEXT,
      entity_name      TEXT,
      location         TEXT,
      country          TEXT,
      related_transaction_id TEXT,
      notes            TEXT,
      checksum         TEXT,
      raw_row          TEXT,
      last_edited_time TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS movies (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id          INTEGER NOT NULL,
      title            TEXT NOT NULL,
      overview         TEXT,
      genres           TEXT,
      release_date     TEXT,
      runtime          INTEGER,
      status           TEXT,
      vote_average     REAL,
      vote_count       INTEGER,
      original_title   TEXT,
      original_language TEXT,
      imdb_id          TEXT,
      tagline          TEXT,
      budget           INTEGER,
      revenue          INTEGER,
      poster_path      TEXT,
      backdrop_path    TEXT,
      logo_path        TEXT,
      poster_override_path TEXT,
      discover_rating_key TEXT,
      rotation_status  TEXT,
      rotation_expires_at TEXT,
      rotation_marked_at TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tv_shows (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      tvdb_id          INTEGER NOT NULL,
      name             TEXT NOT NULL,
      overview         TEXT,
      genres           TEXT,
      networks         TEXT,
      first_air_date   TEXT,
      last_air_date    TEXT,
      status           TEXT,
      original_language TEXT,
      original_name    TEXT,
      number_of_seasons INTEGER,
      number_of_episodes INTEGER,
      episode_run_time  INTEGER,
      vote_average     REAL,
      vote_count       INTEGER,
      poster_path      TEXT,
      backdrop_path    TEXT,
      logo_path        TEXT,
      poster_override_path TEXT,
      discover_rating_key TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS home_inventory (
      id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id        TEXT,
      item_name        TEXT NOT NULL,
      brand            TEXT,
      model            TEXT,
      item_id          TEXT,
      room             TEXT,
      location         TEXT,
      type             TEXT,
      condition        TEXT DEFAULT 'Good',
      in_use           INTEGER,
      deductible       INTEGER,
      purchase_date    TEXT,
      warranty_expires TEXT,
      replacement_value REAL,
      resale_value     REAL,
      purchase_transaction_id TEXT,
      purchased_from_id TEXT,
      purchased_from_name TEXT,
      purchase_price   REAL,
      asset_id         TEXT,
      notes            TEXT,
      location_id      TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      last_edited_time TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type     TEXT NOT NULL,
      source_id       TEXT NOT NULL,
      chunk_index     INTEGER NOT NULL DEFAULT 0,
      content_hash    TEXT NOT NULL,
      content_preview TEXT NOT NULL DEFAULT '',
      model           TEXT NOT NULL DEFAULT '',
      dimensions      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_type, source_id, chunk_index)
    );
  `);

  return db;
}

// ---------------------------------------------------------------------------
// Formatter tests — pure functions
// ---------------------------------------------------------------------------

describe('toTransactionText', () => {
  it('includes description, merchant, category, notes', () => {
    const text = toTransactionText({
      id: 'tx-1',
      description: 'Coffee at Starbucks',
      entityName: 'Starbucks',
      tags: 'food,drinks',
      notes: 'morning coffee',
      account: 'checking',
      amount: -5.5,
      date: '2026-04-19',
      type: 'debit',
      notionId: null,
      entityId: null,
      location: null,
      country: null,
      relatedTransactionId: null,
      checksum: null,
      rawRow: null,
      lastEditedTime: '2026-04-19T12:00:00Z',
    });
    expect(text).toContain('Description: Coffee at Starbucks');
    expect(text).toContain('Merchant: Starbucks');
    expect(text).toContain('Category: food,drinks');
    expect(text).toContain('Notes: morning coffee');
  });

  it('skips null/empty fields', () => {
    const text = toTransactionText({
      id: 'tx-2',
      description: 'ATM withdrawal',
      entityName: null,
      tags: '',
      notes: null,
      account: 'savings',
      amount: -100,
      date: '2026-04-19',
      type: 'debit',
      notionId: null,
      entityId: null,
      location: null,
      country: null,
      relatedTransactionId: null,
      checksum: null,
      rawRow: null,
      lastEditedTime: '2026-04-19T12:00:00Z',
    });
    expect(text).toContain('Description: ATM withdrawal');
    expect(text).not.toContain('Merchant:');
    expect(text).not.toContain('Notes:');
  });
});

describe('toMovieText', () => {
  it('includes title, overview, genres', () => {
    const text = toMovieText({
      id: 1,
      tmdbId: 100,
      title: 'The Matrix',
      overview: 'A hacker discovers reality.',
      genres: 'Action,Sci-Fi',
      releaseDate: '1999-03-31',
      runtime: 136,
      status: 'Released',
      originalTitle: 'The Matrix',
      originalLanguage: 'en',
      imdbId: 'tt0133093',
      tagline: null,
      budget: null,
      revenue: null,
      voteAverage: 8.7,
      voteCount: 22000,
      posterPath: null,
      backdropPath: null,
      logoPath: null,
      posterOverridePath: null,
      discoverRatingKey: null,
      rotationStatus: null,
      rotationExpiresAt: null,
      rotationMarkedAt: null,
      createdAt: '2026-04-19T12:00:00Z',
      updatedAt: '2026-04-19T12:00:00Z',
    });
    expect(text).toContain('Title: The Matrix');
    expect(text).toContain('Overview: A hacker discovers reality.');
    expect(text).toContain('Genres: Action,Sci-Fi');
  });
});

describe('toTvShowText', () => {
  it('includes title (name), overview, genres', () => {
    const text = toTvShowText({
      id: 1,
      tvdbId: 200,
      name: 'Breaking Bad',
      overview: 'Chemistry teacher turns drug lord.',
      genres: 'Crime,Drama',
      networks: null,
      firstAirDate: '2008-01-20',
      lastAirDate: '2013-09-29',
      status: 'Ended',
      originalLanguage: 'en',
      originalName: 'Breaking Bad',
      numberOfSeasons: 5,
      numberOfEpisodes: 62,
      episodeRunTime: 47,
      voteAverage: 9.5,
      voteCount: 14000,
      posterPath: null,
      backdropPath: null,
      logoPath: null,
      posterOverridePath: null,
      discoverRatingKey: null,
      createdAt: '2026-04-19T12:00:00Z',
      updatedAt: '2026-04-19T12:00:00Z',
    });
    expect(text).toContain('Title: Breaking Bad');
    expect(text).toContain('Overview: Chemistry teacher turns drug lord.');
    expect(text).toContain('Genres: Crime,Drama');
  });
});

describe('toInventoryText', () => {
  it('includes name, brand, type, location', () => {
    const text = toInventoryText({
      id: 'inv-1',
      notionId: null,
      itemName: 'MacBook Pro',
      brand: 'Apple',
      model: 'M3 Pro',
      itemId: null,
      room: 'Office',
      location: 'Desk drawer',
      type: 'Electronics',
      condition: 'Excellent',
      inUse: 1,
      deductible: 0,
      purchaseDate: '2024-01-01',
      warrantyExpires: null,
      replacementValue: 2500,
      resaleValue: 1800,
      purchaseTransactionId: null,
      purchasedFromId: null,
      purchasedFromName: null,
      purchasePrice: 2499.99,
      assetId: null,
      notes: null,
      locationId: null,
      createdAt: '2026-04-19T12:00:00Z',
      updatedAt: '2026-04-19T12:00:00Z',
      lastEditedTime: '2026-04-19T12:00:00Z',
    });
    expect(text).toContain('Name: MacBook Pro');
    expect(text).toContain('Brand: Apple');
    expect(text).toContain('Type: Electronics');
    expect(text).toContain('Location: Desk drawer');
  });

  it('skips null fields', () => {
    const text = toInventoryText({
      id: 'inv-2',
      notionId: null,
      itemName: 'Chair',
      brand: null,
      model: null,
      itemId: null,
      room: null,
      location: null,
      type: null,
      condition: null,
      inUse: null,
      deductible: null,
      purchaseDate: null,
      warrantyExpires: null,
      replacementValue: null,
      resaleValue: null,
      purchaseTransactionId: null,
      purchasedFromId: null,
      purchasedFromName: null,
      purchasePrice: null,
      assetId: null,
      notes: null,
      locationId: null,
      createdAt: '2026-04-19T12:00:00Z',
      updatedAt: '2026-04-19T12:00:00Z',
      lastEditedTime: '2026-04-19T12:00:00Z',
    });
    expect(text).toContain('Name: Chair');
    expect(text).not.toContain('Brand:');
    expect(text).not.toContain('Type:');
    expect(text).not.toContain('Location:');
  });
});

// ---------------------------------------------------------------------------
// CrossSourceIndexer.scanAndEnqueue tests
// ---------------------------------------------------------------------------

describe('CrossSourceIndexer.scanAndEnqueue', () => {
  let db: Database;
  let indexer: CrossSourceIndexer;

  beforeEach(() => {
    db = createCrossSourceTestDb();
    indexer = new CrossSourceIndexer(drizzle(db));
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  it('enqueues a job for a transaction with no existing embedding', async () => {
    db.prepare(
      `INSERT INTO transactions (id, description, account, amount, date, type, tags, last_edited_time)
       VALUES ('tx-001', 'Grocery shopping', 'checking', -50, '2026-04-19', 'debit', 'food', '2026-04-19T12:00:00Z')`
    ).run();

    const { enqueued } = await indexer.scanAndEnqueue(['transaction']);

    expect(enqueued).toBe(1);
    expect(mockAdd).toHaveBeenCalledOnce();
    const call = mockAdd.mock.calls[0];
    expect(call?.[1]).toMatchObject({ sourceType: 'transaction', sourceId: 'tx-001' });
    expect(call?.[1].content).toContain('Grocery shopping');
  });

  it('does NOT re-enqueue when embedding hash matches', async () => {
    // Insert with NO tags/entity so the text is predictably just "Description: Coffee"
    db.prepare(
      `INSERT INTO transactions (id, description, account, amount, date, type, tags, last_edited_time)
       VALUES ('tx-002', 'Coffee', 'checking', -5, '2026-04-19', 'debit', '', '2026-04-19T12:00:00Z')`
    ).run();

    // Compute what the hash would be for this row.
    const { createHash } = await import('node:crypto');
    const text = 'Description: Coffee';
    const hash = createHash('sha256').update(text).digest('hex');

    db.prepare(
      `INSERT INTO embeddings (source_type, source_id, content_hash, content_preview, model, dimensions, created_at)
       VALUES ('transaction', 'tx-002', ?, '', '', 0, datetime('now'))`
    ).run(hash);

    const { enqueued } = await indexer.scanAndEnqueue(['transaction']);

    expect(enqueued).toBe(0);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('re-enqueues when embedding hash differs', async () => {
    db.prepare(
      `INSERT INTO transactions (id, description, account, amount, date, type, tags, last_edited_time)
       VALUES ('tx-003', 'Updated description', 'checking', -5, '2026-04-19', 'debit', '', '2026-04-19T12:00:00Z')`
    ).run();

    // Insert stale embedding with wrong hash.
    db.prepare(
      `INSERT INTO embeddings (source_type, source_id, content_hash, content_preview, model, dimensions, created_at)
       VALUES ('transaction', 'tx-003', 'old-hash-stale', '', '', 0, datetime('now'))`
    ).run();

    const { enqueued } = await indexer.scanAndEnqueue(['transaction']);

    expect(enqueued).toBe(1);
    expect(mockAdd).toHaveBeenCalledOnce();
  });

  it('returns enqueued: 0 for empty tables', async () => {
    const { enqueued } = await indexer.scanAndEnqueue();
    expect(enqueued).toBe(0);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('processes only requested source types', async () => {
    db.prepare(
      `INSERT INTO movies (tmdb_id, title, created_at, updated_at)
       VALUES (999, 'Test Movie', datetime('now'), datetime('now'))`
    ).run();

    db.prepare(
      `INSERT INTO transactions (id, description, account, amount, date, type, tags, last_edited_time)
       VALUES ('tx-onlythis', 'This transaction', 'checking', -1, '2026-04-19', 'debit', '', '2026-04-19T12:00:00Z')`
    ).run();

    // Only scan transactions.
    const { enqueued } = await indexer.scanAndEnqueue(['transaction']);

    expect(enqueued).toBe(1);
    // Verify only transaction was enqueued, not movie.
    const calls = mockAdd.mock.calls;
    expect(calls.every((c) => c[1]?.sourceType === 'transaction')).toBe(true);
  });
});
