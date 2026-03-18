/**
 * Shared test utilities for finance-api.
 * Provides in-memory SQLite setup, tRPC caller factory, Notion mocking, and seed helpers.
 */
import type { Database } from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import type { Client } from "@notionhq/client";
import { setDb, closeDb } from "../db.js";
import { appRouter } from "../router.js";
import type { Context } from "../trpc.js";
import {
  createMockNotionClient,
  resetNotionMock,
  getMockPages,
  seedMockPage,
} from "./notion-mock.js";
import { setMockNotionClient, clearMockNotionClient, getMockNotionClient } from "./test-globals.js";

/**
 * Re-export Notion mock utilities for use in tests.
 */
export {
  resetNotionMock,
  getMockPages,
  setMockNotionClient,
  clearMockNotionClient,
  getMockNotionClient,
};

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
 * Create an in-memory SQLite DB with the entities table schema.
 * Call this in beforeEach to get a fresh DB per test.
 */
export function createTestDb(): Database {
  const db = new BetterSqlite3(":memory:");
  db.pragma("journal_mode = WAL");

  // Create all tables that finance-api might query
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id                       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id                TEXT UNIQUE,
      name                     TEXT NOT NULL,
      type                     TEXT,
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
      last_edited_time TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
    CREATE INDEX IF NOT EXISTS idx_transactions_entity ON transactions(entity_id);

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
      last_edited_time       TEXT NOT NULL
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
  `);

  return db;
}

/**
 * Seed a single entity row into the test DB.
 * Inserts into both SQLite and mock Notion to keep stores in sync.
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

  // Insert into SQLite
  db.prepare(
    `
    INSERT INTO entities (id, name, type, abn, aliases, default_transaction_type, default_tags, notes, last_edited_time)
    VALUES (@id, @name, @type, @abn, @aliases, @default_transaction_type, @default_tags, @notes, @last_edited_time)
  `
  ).run({
    id,
    name: overrides.name ?? "Test Entity",
    type: overrides.type ?? null,
    abn: overrides.abn ?? null,
    aliases: overrides.aliases ?? null,
    default_transaction_type: overrides.default_transaction_type ?? null,
    default_tags: overrides.default_tags ?? null,
    notes: overrides.notes ?? null,
    last_edited_time: overrides.last_edited_time ?? "2025-01-01T00:00:00.000Z",
  });

  // Also seed into mock Notion
  seedMockPage(id, {
    Name: { title: [{ text: { content: overrides.name ?? "Test Entity" } }] },
  });

  return id;
}

/**
 * Seed a single transaction row into the test DB.
 * Inserts into both SQLite and mock Notion to keep stores in sync.
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
    last_edited_time: string;
  }> = {}
): string {
  const id = overrides.id ?? crypto.randomUUID();

  // Insert into SQLite
  db.prepare(
    `
    INSERT INTO transactions (
      id, description, account, amount, date, type, tags,
      entity_id, entity_name, location, country,
      related_transaction_id, notes, last_edited_time
    )
    VALUES (
      @id, @description, @account, @amount, @date, @type, @tags,
      @entity_id, @entity_name, @location, @country,
      @related_transaction_id, @notes, @last_edited_time
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
    last_edited_time: overrides.last_edited_time ?? "2025-01-01T00:00:00.000Z",
  });

  // Also seed into mock Notion
  seedMockPage(id, {
    Description: { title: [{ text: { content: overrides.description ?? "Test Transaction" } }] },
  });

  return id;
}

/**
 * Seed a single inventory item row into the test DB.
 * Inserts into both SQLite and mock Notion to keep stores in sync.
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

  // Insert into SQLite
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

  // Also seed into mock Notion
  seedMockPage(id, {
    "Item Name": { title: [{ text: { content: overrides.item_name ?? "Test Item" } }] },
  });

  return id;
}

/**
 * Seed a single budget row into the test DB.
 * Inserts into both SQLite and mock Notion to keep stores in sync.
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

  // Insert into SQLite
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

  // Also seed into mock Notion
  seedMockPage(id, {
    Category: { title: [{ text: { content: overrides.category ?? "Test Category" } }] },
  });

  return id;
}

/**
 * Seed a single wish list item row into the test DB.
 * Inserts into both SQLite and mock Notion to keep stores in sync.
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

  // Insert into SQLite
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

  // Also seed into mock Notion
  seedMockPage(id, {
    Item: { title: [{ text: { content: overrides.item ?? "Test Wish List Item" } }] },
  });

  return id;
}

/**
 * Setup helper for test suites. Call in beforeEach/afterEach.
 * Returns the test DB, a tRPC caller, and the mock Notion client.
 */
export function setupTestContext() {
  let db: Database;
  let notionMock: Client;

  function setup(): { db: Database; caller: ReturnType<typeof createCaller>; notionMock: Client } {
    // Set required env vars for tests
    process.env.NOTION_API_TOKEN = "test-token";
    process.env.NOTION_BALANCE_SHEET_ID = "test-balance-sheet-id";
    process.env.NOTION_ENTITIES_DB_ID = "test-entities-db-id";
    process.env.NOTION_HOME_INVENTORY_ID = "test-inventory-id";
    process.env.NOTION_BUDGET_ID = "test-budget-id";
    process.env.NOTION_WISH_LIST_ID = "test-wishlist-id";

    db = createTestDb();
    setDb(db);

    // Initialize Notion mock
    notionMock = createMockNotionClient();
    setMockNotionClient(notionMock);
    resetNotionMock();

    return { db, caller: createCaller(true), notionMock };
  }

  function teardown() {
    closeDb();
    clearMockNotionClient();
    resetNotionMock();

    // Clean up env vars
    delete process.env.NOTION_API_TOKEN;
    delete process.env.NOTION_BALANCE_SHEET_ID;
    delete process.env.NOTION_ENTITIES_DB_ID;
    delete process.env.NOTION_HOME_INVENTORY_ID;
    delete process.env.NOTION_BUDGET_ID;
    delete process.env.NOTION_WISH_LIST_ID;
  }

  return { setup, teardown };
}
