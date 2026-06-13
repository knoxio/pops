/**
 * Boot-time backfill tests for `backfillFinanceFromShared` (Track N
 * per-pillar cutover).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * pillar's `finance.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). Confirms per finance-owned table:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the per-table WHERE filter dedupes),
 *   - mixed state (some rows already in finance) only inserts the missing ones,
 *   - missing source table is tolerated without throwing,
 *   - FK-bearing `transactions` lands after its `entities` parent because
 *     the TABLE_COPIES order puts parents first.
 *
 * `transaction_corrections`, `transaction_tag_rules`, `tag_vocabulary`,
 * and `budgets` left the bridge in Theme 13 PR4 round 2 once every
 * consumer flipped to `getFinanceDrizzle()`. Their fixtures are still
 * imported here so the shared-DB seed mirrors a realistic legacy
 * `pops.db` (those tables still exist on disk for older deploys), but
 * the backfill is no longer asserted to copy them — the per-table
 * describe blocks were removed alongside their TABLE_COPIES entries.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb } from '@pops/finance-db';

import { backfillFinanceFromShared } from './backfill-finance-from-shared.js';
import {
  BUDGETS_TABLE_SQL,
  ENTITIES_TABLE_SQL,
  TAG_VOCABULARY_TABLE_SQL,
  TRANSACTION_CORRECTIONS_TABLE_SQL,
  TRANSACTION_TAG_RULES_TABLE_SQL,
  TRANSACTIONS_TABLE_SQL,
} from './backfill-test-fixtures.js';

const ALL_FINANCE_TABLES_SQL = [
  ENTITIES_TABLE_SQL,
  TRANSACTIONS_TABLE_SQL,
  TRANSACTION_CORRECTIONS_TABLE_SQL,
  TRANSACTION_TAG_RULES_TABLE_SQL,
  TAG_VOCABULARY_TABLE_SQL,
  BUDGETS_TABLE_SQL,
].join('\n');

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-backfill-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function openSharedWithSeed(seed: (raw: BetterSqlite3.Database) => void): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(ALL_FINANCE_TABLES_SQL);
  seed(raw);
  raw.close();
  return path;
}

function countRows(raw: BetterSqlite3.Database, table: string): number {
  const row = raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

/**
 * Open the finance DB and add the `transactions` table that the
 * in-flight N2 cutover PR will introduce via its own baseline migration.
 * The current finance baseline (entities, transaction_corrections,
 * transaction_tag_rules, tag_vocabulary, budgets, wish_list) already
 * covers everything else; `wish_list` is no longer carried by the
 * bridge (Theme 13 PR4) but its finance.db table is still part of the
 * baseline. The backfill must already be ready for the transactions
 * cutover before that PR lands — this helper simulates the post-cutover
 * finance.db so the tests exercise the full TABLE_COPIES set.
 *
 * The DDL is rewritten to `IF NOT EXISTS` so this helper stays safe once
 * the N2 cutover lands and `openFinanceDb()` starts creating the
 * `transactions` table (and its indexes) via the finance-db migration —
 * otherwise the second CREATE would throw "table already exists".
 */
function openFinanceForCutover(path: string): ReturnType<typeof openFinanceDb> {
  const finance = openFinanceDb(path);
  const idempotentSql = TRANSACTIONS_TABLE_SQL.replaceAll(
    'CREATE TABLE ',
    'CREATE TABLE IF NOT EXISTS '
  )
    .replaceAll('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replaceAll('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ');
  finance.raw.exec(idempotentSql);
  return finance;
}

describe('backfillFinanceFromShared', () => {
  it('tolerates a shared DB with no finance-owned tables (post-PR-4 drop scenario)', () => {
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(`CREATE TABLE other_table (id integer PRIMARY KEY)`);
    raw.close();

    const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
    try {
      expect(() => backfillFinanceFromShared(finance, sharedPath)).not.toThrow();
      expect(countRows(finance.raw, 'entities')).toBe(0);
      expect(countRows(finance.raw, 'transactions')).toBe(0);
    } finally {
      finance.raw.close();
    }
  });

  it('tolerates a shared DB missing some finance tables (partial legacy)', () => {
    // Shared DB only has entities — transactions / corrections / tag rules
    // / tag vocabulary / budgets are absent. Backfill must copy what's
    // there and skip the rest without throwing.
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(ENTITIES_TABLE_SQL);
    raw.exec(
      `INSERT INTO entities (id, name, last_edited_time) VALUES ('ent-1', 'Acme', '2026-06-10T00:00:00Z')`
    );
    raw.close();

    const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
    try {
      expect(() => backfillFinanceFromShared(finance, sharedPath)).not.toThrow();
      expect(countRows(finance.raw, 'entities')).toBe(1);
      expect(countRows(finance.raw, 'transactions')).toBe(0);
    } finally {
      finance.raw.close();
    }
  });

  describe('entities', () => {
    it('copies entities rows on first run and is idempotent', () => {
      const sharedPath = openSharedWithSeed((raw) => {
        raw.exec(
          `INSERT INTO entities (id, name, type, last_edited_time) VALUES ('ent-1', 'Acme', 'company', '2026-06-10T00:00:00Z')`
        );
        raw.exec(
          `INSERT INTO entities (id, name, type, last_edited_time) VALUES ('ent-2', 'Beta', 'individual', '2026-06-10T00:00:00Z')`
        );
      });

      const finance = openFinanceDb(join(tmpDir, 'finance.db'));
      try {
        backfillFinanceFromShared(finance, sharedPath);
        backfillFinanceFromShared(finance, sharedPath);
        const rows = finance.raw
          .prepare('SELECT id, name, type FROM entities ORDER BY id')
          .all() as { id: string; name: string; type: string }[];
        expect(rows).toEqual([
          { id: 'ent-1', name: 'Acme', type: 'company' },
          { id: 'ent-2', name: 'Beta', type: 'individual' },
        ]);
      } finally {
        finance.raw.close();
      }
    });
  });

  describe('transactions', () => {
    it('copies transactions after entities so the FK to entities resolves', () => {
      const sharedPath = openSharedWithSeed((raw) => {
        raw.exec(
          `INSERT INTO entities (id, name, last_edited_time) VALUES ('ent-1', 'Acme', '2026-06-10T00:00:00Z')`
        );
        raw.exec(
          `INSERT INTO transactions (id, description, account, amount, date, type, entity_id, last_edited_time)
           VALUES ('tx-1', 'Coffee', 'checking', -4.5, '2026-06-10', 'purchase', 'ent-1', '2026-06-10T00:00:00Z')`
        );
      });

      const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
      try {
        backfillFinanceFromShared(finance, sharedPath);
        const row = finance.raw
          .prepare('SELECT id, entity_id FROM transactions WHERE id = ?')
          .get('tx-1') as { id: string; entity_id: string };
        expect(row).toEqual({ id: 'tx-1', entity_id: 'ent-1' });
      } finally {
        finance.raw.close();
      }
    });

    it('is idempotent and re-running does not duplicate rows', () => {
      const sharedPath = openSharedWithSeed((raw) => {
        raw.exec(
          `INSERT INTO entities (id, name, last_edited_time) VALUES ('ent-1', 'Acme', '2026-06-10T00:00:00Z')`
        );
        raw.exec(
          `INSERT INTO transactions (id, description, account, amount, date, type, entity_id, last_edited_time)
           VALUES ('tx-1', 'Coffee', 'checking', -4.5, '2026-06-10', 'purchase', 'ent-1', '2026-06-10T00:00:00Z')`
        );
      });

      const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
      try {
        backfillFinanceFromShared(finance, sharedPath);
        backfillFinanceFromShared(finance, sharedPath);
        expect(countRows(finance.raw, 'transactions')).toBe(1);
      } finally {
        finance.raw.close();
      }
    });
  });

  describe('FK-safe ordering across the bridge set', () => {
    it('copies parents (entities) before children (transactions) with foreign_keys = ON', () => {
      const sharedPath = openSharedWithSeed((raw) => {
        raw.exec(
          `INSERT INTO entities (id, name, last_edited_time) VALUES ('ent-1', 'Acme', '2026-06-10T00:00:00Z')`
        );
        raw.exec(
          `INSERT INTO entities (id, name, last_edited_time) VALUES ('ent-2', 'Beta', '2026-06-10T00:00:00Z')`
        );
        raw.exec(
          `INSERT INTO transactions (id, description, account, amount, date, type, entity_id, last_edited_time)
           VALUES ('tx-1', 'Coffee', 'checking', -4.5, '2026-06-10', 'purchase', 'ent-1', '2026-06-10T00:00:00Z'),
                  ('tx-2', 'Lunch', 'checking', -18.0, '2026-06-10', 'purchase', 'ent-2', '2026-06-10T00:00:00Z')`
        );
      });

      const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
      try {
        backfillFinanceFromShared(finance, sharedPath);
        expect(countRows(finance.raw, 'entities')).toBe(2);
        expect(countRows(finance.raw, 'transactions')).toBe(2);
      } finally {
        finance.raw.close();
      }
    });
  });

  describe('dropped tables (Theme 13 PR4 round 2)', () => {
    it('does not copy transaction_corrections / transaction_tag_rules / tag_vocabulary / budgets even when the shared DB has rows', () => {
      // These four tables left TABLE_COPIES once every consumer flipped to
      // `getFinanceDrizzle()`. The bridge must no longer pull them across
      // — finance.db is now the canonical source and the shared rows are
      // stale (or absent on freshly-provisioned deploys).
      const sharedPath = openSharedWithSeed((raw) => {
        raw.exec(
          `INSERT INTO entities (id, name, last_edited_time) VALUES ('ent-1', 'Acme', '2026-06-10T00:00:00Z')`
        );
        raw.exec(
          `INSERT INTO transaction_corrections (id, description_pattern, entity_id) VALUES ('corr-stale', 'COFFEE.*', 'ent-1')`
        );
        raw.exec(
          `INSERT INTO transaction_tag_rules (id, description_pattern, entity_id, tags) VALUES ('rule-stale', 'LUNCH.*', 'ent-1', '["Eat Out"]')`
        );
        raw.exec(`INSERT INTO tag_vocabulary (tag, source) VALUES ('stale-bridge-tag', 'user')`);
        raw.exec(
          `INSERT INTO budgets (id, category, period, amount, last_edited_time) VALUES ('bud-stale', 'Stale', '2026-06', 1.0, '2026-06-10T00:00:00Z')`
        );
      });

      const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
      try {
        backfillFinanceFromShared(finance, sharedPath);
        expect(
          finance.raw.prepare(`SELECT 1 FROM transaction_corrections WHERE id = 'corr-stale'`).get()
        ).toBeUndefined();
        expect(
          finance.raw.prepare(`SELECT 1 FROM transaction_tag_rules WHERE id = 'rule-stale'`).get()
        ).toBeUndefined();
        expect(
          finance.raw.prepare(`SELECT 1 FROM tag_vocabulary WHERE tag = 'stale-bridge-tag'`).get()
        ).toBeUndefined();
        expect(
          finance.raw.prepare(`SELECT 1 FROM budgets WHERE id = 'bud-stale'`).get()
        ).toBeUndefined();
      } finally {
        finance.raw.close();
      }
    });
  });
});
