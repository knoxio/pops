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

    CREATE TABLE IF NOT EXISTS locations (
      id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name             TEXT NOT NULL,
      parent_id        TEXT REFERENCES locations(id) ON DELETE CASCADE,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      last_edited_time TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);
    CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);

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
      asset_id               TEXT UNIQUE,
      notes                  TEXT,
      location_id            TEXT,
      last_edited_time       TEXT NOT NULL,
      FOREIGN KEY (purchase_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
      FOREIGN KEY (purchased_from_id) REFERENCES entities(id) ON DELETE SET NULL,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_asset_id ON home_inventory(asset_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON home_inventory(item_name);
    CREATE INDEX IF NOT EXISTS idx_inventory_location ON home_inventory(location_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_type ON home_inventory(type);

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

    CREATE TABLE IF NOT EXISTS item_connections (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      item_a_id  TEXT NOT NULL,
      item_b_id  TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_a_id) REFERENCES home_inventory(id) ON DELETE CASCADE,
      FOREIGN KEY (item_b_id) REFERENCES home_inventory(id) ON DELETE CASCADE,
      CHECK (item_a_id < item_b_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_item_connections_pair ON item_connections(item_a_id, item_b_id);
    CREATE INDEX IF NOT EXISTS idx_item_connections_a ON item_connections(item_a_id);
    CREATE INDEX IF NOT EXISTS idx_item_connections_b ON item_connections(item_b_id);

    CREATE TABLE IF NOT EXISTS item_photos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id    TEXT NOT NULL,
      file_path  TEXT NOT NULL,
      caption    TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES home_inventory(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_item_photos_item ON item_photos(item_id);
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
    asset_id: string | null;
    notes: string | null;
    location_id: string | null;
    last_edited_time: string;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO home_inventory (
      id, item_name, brand, model, item_id, room, location, type, condition,
      in_use, deductible, purchase_date, warranty_expires, replacement_value, resale_value,
      purchase_transaction_id, purchased_from_id, purchased_from_name,
      asset_id, notes, location_id, last_edited_time
    )
    VALUES (
      @id, @item_name, @brand, @model, @item_id, @room, @location, @type, @condition,
      @in_use, @deductible, @purchase_date, @warranty_expires, @replacement_value, @resale_value,
      @purchase_transaction_id, @purchased_from_id, @purchased_from_name,
      @asset_id, @notes, @location_id, @last_edited_time
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
    asset_id: overrides.asset_id ?? null,
    notes: overrides.notes ?? null,
    location_id: overrides.location_id ?? null,
    last_edited_time: overrides.last_edited_time ?? "2025-01-01T00:00:00.000Z",
  });

  return id;
}

/**
 * Seed a single location row into the test DB.
 * Returns the id.
 */
export function seedLocation(
  db: Database,
  overrides: Partial<{
    id: string;
    name: string;
    parent_id: string | null;
    sort_order: number;
    last_edited_time: string;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO locations (id, name, parent_id, sort_order, last_edited_time)
    VALUES (@id, @name, @parent_id, @sort_order, @last_edited_time)
  `
  ).run({
    id,
    name: overrides.name ?? "Test Location",
    parent_id: overrides.parent_id ?? null,
    sort_order: overrides.sort_order ?? 0,
    last_edited_time: overrides.last_edited_time ?? "2025-01-01T00:00:00.000Z",
  });

  return id;
}

/**
 * Seed an item connection row into the test DB.
 * Returns the auto-incremented id.
 */
export function seedItemConnection(
  db: Database,
  itemAId: string,
  itemBId: string
): number {
  // Enforce A < B ordering
  const [a, b] = itemAId < itemBId ? [itemAId, itemBId] : [itemBId, itemAId];

  const result = db.prepare(
    `INSERT INTO item_connections (item_a_id, item_b_id) VALUES (@a, @b)`
  ).run({ a, b });

  return Number(result.lastInsertRowid);
}

/**
 * Seed an item photo row into the test DB.
 * Returns the auto-incremented id.
 */
export function seedItemPhoto(
  db: Database,
  overrides: {
    item_id: string;
    file_path?: string;
    caption?: string | null;
    sort_order?: number;
  }
): number {
  const result = db.prepare(
    `
    INSERT INTO item_photos (item_id, file_path, caption, sort_order)
    VALUES (@item_id, @file_path, @caption, @sort_order)
  `
  ).run({
    item_id: overrides.item_id,
    file_path: overrides.file_path ?? "items/test/photo_001.jpg",
    caption: overrides.caption ?? null,
    sort_order: overrides.sort_order ?? 0,
  });

  return Number(result.lastInsertRowid);
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
