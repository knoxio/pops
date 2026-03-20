/**
 * Shared test utilities for pops-api.
 * Provides in-memory SQLite setup, tRPC caller factory, and seed helpers.
 */
import type { Database } from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import { setDb, closeDb } from "../db.js";
import { appRouter } from "../router.js";
import type { Context } from "../trpc.js";

/**
 * Create a tRPC caller with authentication.
 * Use this in tests to call procedures directly.
 */
export function createCaller(authenticated = true): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: authenticated ? { email: "test@example.com" } : null,
  };
  return appRouter.createCaller(ctx);
}

/**
 * Create an in-memory SQLite DB with the full schema.
 * Call this in beforeEach to get a fresh DB per test.
 */
export function createTestDb(): Database {
  const db = new BetterSqlite3(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Create all tables that pops-api might query
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id                       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id                TEXT UNIQUE,
      name                     TEXT NOT NULL,
      type                     TEXT NOT NULL DEFAULT 'company',
      abn                      TEXT,
      aliases                  TEXT,
      default_transaction_type TEXT,
      default_tags             TEXT,
      notes                    TEXT,
      last_edited_time         TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

    CREATE TABLE IF NOT EXISTS transactions (
      id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id       TEXT UNIQUE,
      description     TEXT NOT NULL,
      account         TEXT NOT NULL,
      amount          REAL NOT NULL,
      date            TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT '',
      tags            TEXT NOT NULL DEFAULT '[]',
      entity_id       TEXT,
      entity_name     TEXT,
      location        TEXT,
      country         TEXT,
      related_transaction_id TEXT,
      notes           TEXT,
      checksum        TEXT,
      raw_row         TEXT,
      last_edited_time TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
    CREATE INDEX IF NOT EXISTS idx_transactions_entity ON transactions(entity_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_checksum ON transactions(checksum);

    CREATE TABLE IF NOT EXISTS home_inventory (
      id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id              TEXT UNIQUE,
      item_name              TEXT NOT NULL,
      brand                  TEXT,
      model                  TEXT,
      item_id                TEXT,
      room                   TEXT,
      location               TEXT,
      type                   TEXT,
      condition              TEXT,
      in_use                 INTEGER NOT NULL DEFAULT 0,
      deductible             INTEGER NOT NULL DEFAULT 0,
      purchase_date          TEXT,
      warranty_expires       TEXT,
      replacement_value      REAL,
      resale_value           REAL,
      purchase_transaction_id TEXT,
      purchased_from_id      TEXT,
      purchased_from_name    TEXT,
      last_edited_time       TEXT NOT NULL,
      FOREIGN KEY (purchase_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
      FOREIGN KEY (purchased_from_id) REFERENCES entities(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id        TEXT UNIQUE,
      category         TEXT NOT NULL,
      period           TEXT,
      amount           REAL,
      active           INTEGER NOT NULL DEFAULT 0,
      notes            TEXT,
      last_edited_time TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);

    CREATE TABLE IF NOT EXISTS wish_list (
      id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id        TEXT UNIQUE,
      item             TEXT NOT NULL,
      target_amount    REAL,
      saved            REAL,
      priority         TEXT,
      url              TEXT,
      notes            TEXT,
      last_edited_time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movies (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id            INTEGER NOT NULL,
      imdb_id            TEXT,
      title              TEXT NOT NULL,
      original_title     TEXT,
      overview           TEXT,
      tagline            TEXT,
      release_date       TEXT,
      runtime            INTEGER,
      status             TEXT,
      original_language  TEXT,
      budget             INTEGER,
      revenue            INTEGER,
      poster_path        TEXT,
      backdrop_path      TEXT,
      logo_path          TEXT,
      poster_override_path TEXT,
      vote_average       REAL,
      vote_count         INTEGER,
      genres             TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);
    CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies(release_date);

    CREATE TABLE IF NOT EXISTS transaction_corrections (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      description_pattern TEXT NOT NULL,
      match_type TEXT CHECK(match_type IN ('exact', 'contains', 'regex')) NOT NULL DEFAULT 'exact',
      entity_id TEXT,
      entity_name TEXT,
      location TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      transaction_type TEXT CHECK(transaction_type IN ('purchase', 'transfer', 'income')),
      confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0.0 AND confidence <= 1.0),
      times_applied INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_corrections_pattern ON transaction_corrections(description_pattern);
    CREATE INDEX IF NOT EXISTS idx_corrections_confidence ON transaction_corrections(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_corrections_times_applied ON transaction_corrections(times_applied DESC);

    CREATE TABLE IF NOT EXISTS comparison_dimensions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comparison_dimensions_name ON comparison_dimensions(name);

    CREATE TABLE IF NOT EXISTS comparisons (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension_id  INTEGER NOT NULL REFERENCES comparison_dimensions(id),
      media_a_type  TEXT NOT NULL,
      media_a_id    INTEGER NOT NULL,
      media_b_type  TEXT NOT NULL,
      media_b_id    INTEGER NOT NULL,
      winner_type   TEXT NOT NULL,
      winner_id     INTEGER NOT NULL,
      compared_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_comparisons_dimension_id ON comparisons(dimension_id);
    CREATE INDEX IF NOT EXISTS idx_comparisons_media_a ON comparisons(media_a_type, media_a_id);
    CREATE INDEX IF NOT EXISTS idx_comparisons_media_b ON comparisons(media_b_type, media_b_id);

    CREATE TABLE IF NOT EXISTS media_scores (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      media_type       TEXT NOT NULL,
      media_id         INTEGER NOT NULL,
      dimension_id     INTEGER NOT NULL REFERENCES comparison_dimensions(id),
      score            REAL NOT NULL DEFAULT 1500.0,
      comparison_count INTEGER NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_media_scores_unique ON media_scores(media_type, media_id, dimension_id);
    CREATE INDEX IF NOT EXISTS idx_media_scores_dimension ON media_scores(dimension_id);
  `);

  return db;
}

/**
 * Seed a single entity row into the test DB.
 * Returns the id.
 */
export function seedEntity(
  db: Database,
  overrides: Partial<{
    id: string;
    name: string;
    type: string | null;
    abn: string | null;
    aliases: string | null;
    default_transaction_type: string | null;
    default_tags: string | null;
    notes: string | null;
    last_edited_time: string;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO entities (id, name, type, abn, aliases, default_transaction_type, default_tags, notes, last_edited_time)
    VALUES (@id, @name, @type, @abn, @aliases, @default_transaction_type, @default_tags, @notes, @last_edited_time)
  `
  ).run({
    id,
    name: overrides.name ?? "Test Entity",
    type: overrides.type ?? "company",
    abn: overrides.abn ?? null,
    aliases: overrides.aliases ?? null,
    default_transaction_type: overrides.default_transaction_type ?? null,
    default_tags: overrides.default_tags ?? null,
    notes: overrides.notes ?? null,
    last_edited_time: overrides.last_edited_time ?? "2025-01-01T00:00:00.000Z",
  });

  return id;
}

/**
 * Seed a single transaction row into the test DB.
 * Returns the id.
 */
export function seedTransaction(
  db: Database,
  overrides: Partial<{
    id: string;
    description: string;
    account: string;
    amount: number;
    date: string;
    type: string;
    tags: string;
    entity_id: string | null;
    entity_name: string | null;
    location: string | null;
    country: string | null;
    related_transaction_id: string | null;
    notes: string | null;
    checksum: string | null;
    raw_row: string | null;
    last_edited_time: string;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO transactions (
      id, description, account, amount, date, type, tags,
      entity_id, entity_name, location, country,
      related_transaction_id, notes, checksum, raw_row, last_edited_time
    )
    VALUES (
      @id, @description, @account, @amount, @date, @type, @tags,
      @entity_id, @entity_name, @location, @country,
      @related_transaction_id, @notes, @checksum, @raw_row, @last_edited_time
    )
  `
  ).run({
    id,
    description: overrides.description ?? "Test Transaction",
    account: overrides.account ?? "Test Account",
    amount: overrides.amount ?? 100.0,
    date: overrides.date ?? "2025-01-01",
    type: overrides.type ?? "",
    tags: overrides.tags ?? "[]",
    entity_id: overrides.entity_id ?? null,
    entity_name: overrides.entity_name ?? null,
    location: overrides.location ?? null,
    country: overrides.country ?? null,
    related_transaction_id: overrides.related_transaction_id ?? null,
    notes: overrides.notes ?? null,
    checksum: overrides.checksum ?? null,
    raw_row: overrides.raw_row ?? null,
    last_edited_time: overrides.last_edited_time ?? "2025-01-01T00:00:00.000Z",
  });

  return id;
}

/**
 * Seed a single inventory item row into the test DB.
 * Returns the id.
 */
export function seedInventoryItem(
  db: Database,
  overrides: Partial<{
    id: string;
    item_name: string;
    brand: string | null;
    model: string | null;
    item_id: string | null;
    room: string | null;
    location: string | null;
    type: string | null;
    condition: string | null;
    in_use: number;
    deductible: number;
    purchase_date: string | null;
    warranty_expires: string | null;
    replacement_value: number | null;
    resale_value: number | null;
    purchase_transaction_id: string | null;
    purchased_from_id: string | null;
    purchased_from_name: string | null;
    last_edited_time: string;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO home_inventory (
      id, item_name, brand, model, item_id, room, location, type, condition,
      in_use, deductible, purchase_date, warranty_expires, replacement_value, resale_value,
      purchase_transaction_id, purchased_from_id, purchased_from_name, last_edited_time
    )
    VALUES (
      @id, @item_name, @brand, @model, @item_id, @room, @location, @type, @condition,
      @in_use, @deductible, @purchase_date, @warranty_expires, @replacement_value, @resale_value,
      @purchase_transaction_id, @purchased_from_id, @purchased_from_name, @last_edited_time
    )
  `
  ).run({
    id,
    item_name: overrides.item_name ?? "Test Item",
    brand: overrides.brand ?? null,
    model: overrides.model ?? null,
    item_id: overrides.item_id ?? null,
    room: overrides.room ?? null,
    location: overrides.location ?? null,
    type: overrides.type ?? null,
    condition: overrides.condition ?? null,
    in_use: overrides.in_use ?? 0,
    deductible: overrides.deductible ?? 0,
    purchase_date: overrides.purchase_date ?? null,
    warranty_expires: overrides.warranty_expires ?? null,
    replacement_value: overrides.replacement_value ?? null,
    resale_value: overrides.resale_value ?? null,
    purchase_transaction_id: overrides.purchase_transaction_id ?? null,
    purchased_from_id: overrides.purchased_from_id ?? null,
    purchased_from_name: overrides.purchased_from_name ?? null,
    last_edited_time: overrides.last_edited_time ?? "2025-01-01T00:00:00.000Z",
  });

  return id;
}

/**
 * Seed a single budget row into the test DB.
 * Returns the id.
 */
export function seedBudget(
  db: Database,
  overrides: Partial<{
    id: string;
    category: string;
    period: string | null;
    amount: number | null;
    active: number;
    notes: string | null;
    last_edited_time: string;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO budgets (id, category, period, amount, active, notes, last_edited_time)
    VALUES (@id, @category, @period, @amount, @active, @notes, @last_edited_time)
  `
  ).run({
    id,
    category: overrides.category ?? "Test Category",
    period: overrides.period ?? null,
    amount: overrides.amount ?? null,
    active: overrides.active ?? 0,
    notes: overrides.notes ?? null,
    last_edited_time: overrides.last_edited_time ?? "2025-01-01T00:00:00.000Z",
  });

  return id;
}

/**
 * Seed a single wish list item row into the test DB.
 * Returns the id.
 */
export function seedWishListItem(
  db: Database,
  overrides: Partial<{
    id: string;
    item: string;
    target_amount: number | null;
    saved: number | null;
    priority: string | null;
    url: string | null;
    notes: string | null;
    last_edited_time: string;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO wish_list (id, item, target_amount, saved, priority, url, notes, last_edited_time)
    VALUES (@id, @item, @target_amount, @saved, @priority, @url, @notes, @last_edited_time)
  `
  ).run({
    id,
    item: overrides.item ?? "Test Wish List Item",
    target_amount: overrides.target_amount ?? null,
    saved: overrides.saved ?? null,
    priority: overrides.priority ?? null,
    url: overrides.url ?? null,
    notes: overrides.notes ?? null,
    last_edited_time: overrides.last_edited_time ?? "2025-01-01T00:00:00.000Z",
  });

  return id;
}

/**
 * Seed a single movie row into the test DB.
 * Returns the auto-generated id.
 */
export function seedMovie(
  db: Database,
  overrides: Partial<{
    tmdb_id: number;
    imdb_id: string | null;
    title: string;
    original_title: string | null;
    overview: string | null;
    tagline: string | null;
    release_date: string | null;
    runtime: number | null;
    status: string | null;
    original_language: string | null;
    budget: number | null;
    revenue: number | null;
    poster_path: string | null;
    backdrop_path: string | null;
    logo_path: string | null;
    poster_override_path: string | null;
    vote_average: number | null;
    vote_count: number | null;
    genres: string | null;
  }> = {}
): number {
  const result = db.prepare(
    `
    INSERT INTO movies (
      tmdb_id, imdb_id, title, original_title, overview, tagline,
      release_date, runtime, status, original_language,
      budget, revenue, poster_path, backdrop_path, logo_path, poster_override_path,
      vote_average, vote_count, genres
    )
    VALUES (
      @tmdb_id, @imdb_id, @title, @original_title, @overview, @tagline,
      @release_date, @runtime, @status, @original_language,
      @budget, @revenue, @poster_path, @backdrop_path, @logo_path, @poster_override_path,
      @vote_average, @vote_count, @genres
    )
  `
  ).run({
    tmdb_id: overrides.tmdb_id ?? 12345,
    imdb_id: overrides.imdb_id ?? null,
    title: overrides.title ?? "Test Movie",
    original_title: overrides.original_title ?? null,
    overview: overrides.overview ?? null,
    tagline: overrides.tagline ?? null,
    release_date: overrides.release_date ?? null,
    runtime: overrides.runtime ?? null,
    status: overrides.status ?? null,
    original_language: overrides.original_language ?? null,
    budget: overrides.budget ?? null,
    revenue: overrides.revenue ?? null,
    poster_path: overrides.poster_path ?? null,
    backdrop_path: overrides.backdrop_path ?? null,
    logo_path: overrides.logo_path ?? null,
    poster_override_path: overrides.poster_override_path ?? null,
    vote_average: overrides.vote_average ?? null,
    vote_count: overrides.vote_count ?? null,
    genres: overrides.genres ?? "[]",
  });

  return Number(result.lastInsertRowid);
}

/**
 * Setup helper for test suites. Call in beforeEach/afterEach.
 * Returns the test DB and a tRPC caller.
 */
export function setupTestContext() {
  let db: Database;

  function setup(): { db: Database; caller: ReturnType<typeof createCaller> } {
    db = createTestDb();
    setDb(db);

    return { db, caller: createCaller(true) };
  }

  function teardown() {
    closeDb();
  }

  return { setup, teardown };
}

/**
 * Seed a comparison dimension. Returns the id.
 */
export function seedDimension(
  db: Database,
  overrides: Partial<{
    name: string;
    description: string | null;
    active: number;
    sort_order: number;
  }> = {},
): number {
  const result = db.prepare(
    `INSERT INTO comparison_dimensions (name, description, active, sort_order)
     VALUES (@name, @description, @active, @sort_order)`,
  ).run({
    name: overrides.name ?? "Test Dimension",
    description: overrides.description ?? null,
    active: overrides.active ?? 1,
    sort_order: overrides.sort_order ?? 0,
  });
  return Number(result.lastInsertRowid);
}
