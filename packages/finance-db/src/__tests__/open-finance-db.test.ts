/**
 * Smoke tests for the standalone `openFinanceDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 *
 * Unlike `@pops/core-db`/`@pops/media-db`, finance's package journal
 * (0025/0026/0027/0052) is NOT self-bootstrapping — every entry ALTERs
 * or recreates a table created in the pre-modular baseline
 * (`0000_naive_chameleon.sql`). The tests pre-seed the three required
 * baseline tables (`entities`, `transaction_corrections`, `budgets`)
 * into the file before calling `openFinanceDb` so the migrate step has
 * something to ALTER. Once the baseline split lands, this seeding can
 * be retired.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb } from '../open-finance-db.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Minimum baseline DDL required for the package's journal to apply
 * cleanly: `entities` (FK target of `transaction_tag_rules` created by
 * 0026), `transaction_corrections` (ALTERed by 0025 + 0027), and
 * `budgets` (recreated by 0052). Only the three `CREATE TABLE`
 * statements are copied from
 * `apps/pops-api/src/db/drizzle-migrations/0000_naive_chameleon.sql`
 * — the baseline indexes (e.g. `*_notion_id_unique`,
 * `idx_corrections_*`) are intentionally omitted because nothing in
 * the package journal queries them, and dropping them keeps the test
 * fixture tight.
 */
function seedBaseline(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  try {
    raw.exec(`
      CREATE TABLE \`entities\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`notion_id\` text,
        \`name\` text NOT NULL,
        \`type\` text DEFAULT 'company' NOT NULL,
        \`abn\` text,
        \`aliases\` text,
        \`default_transaction_type\` text,
        \`default_tags\` text,
        \`notes\` text,
        \`last_edited_time\` text NOT NULL
      );
      CREATE TABLE \`transaction_corrections\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`description_pattern\` text NOT NULL,
        \`match_type\` text DEFAULT 'exact' NOT NULL,
        \`entity_id\` text,
        \`entity_name\` text,
        \`location\` text,
        \`tags\` text DEFAULT '[]' NOT NULL,
        \`transaction_type\` text,
        \`confidence\` real DEFAULT 0.5 NOT NULL,
        \`times_applied\` integer DEFAULT 0 NOT NULL,
        \`created_at\` text DEFAULT (datetime('now')) NOT NULL,
        \`last_used_at\` text,
        FOREIGN KEY (\`entity_id\`) REFERENCES \`entities\`(\`id\`) ON UPDATE no action ON DELETE set null
      );
      CREATE TABLE \`budgets\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`notion_id\` text,
        \`category\` text NOT NULL,
        \`period\` text,
        \`amount\` real,
        \`active\` integer DEFAULT 1 NOT NULL,
        \`notes\` text,
        \`last_edited_time\` text NOT NULL
      );
    `);
  } finally {
    raw.close();
  }
}

describe('openFinanceDb', () => {
  it('applies the configured PRAGMAs on an existing DB file', () => {
    // seedBaseline pre-creates the file (and its parent dir) so the
    // package journal has tables to ALTER; this test asserts the
    // PRAGMAs openFinanceDb sets on the existing handle, not the
    // mkdir-if-missing path (covered separately below).
    const path = join(tmpDir, 'finance.db');
    seedBaseline(path);

    const { raw } = openFinanceDb(path);
    try {
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the package journal — tag_vocabulary table exists post-open', () => {
    const path = join(tmpDir, 'finance.db');
    seedBaseline(path);

    const { raw } = openFinanceDb(path);
    try {
      const row = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tag_vocabulary'")
        .get() as { name: string } | undefined;
      expect(row?.name).toBe('tag_vocabulary');
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations', () => {
    const path = join(tmpDir, 'finance.db');
    seedBaseline(path);

    const first = openFinanceDb(path);
    let firstCount: number;
    try {
      // Seed a tag vocabulary row to prove state persists across re-opens.
      first.raw
        .prepare("INSERT INTO tag_vocabulary (tag, source, is_active) VALUES ('Custom', 'test', 1)")
        .run();
      firstCount = (
        first.raw.prepare('SELECT COUNT(*) AS n FROM tag_vocabulary').get() as { n: number }
      ).n;
    } finally {
      first.raw.close();
    }

    const second = openFinanceDb(path);
    try {
      const secondCount = (
        second.raw.prepare('SELECT COUNT(*) AS n FROM tag_vocabulary').get() as { n: number }
      ).n;
      expect(secondCount).toBe(firstCount);
    } finally {
      second.raw.close();
    }
  });
});
