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
 *   - FK-bearing tables (transactions, corrections, tag rules) land after
 *     their `entities` parents because the TABLE_COPIES order puts parents first.
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
  WISH_LIST_TABLE_SQL,
} from './backfill-test-fixtures.js';

const ALL_FINANCE_TABLES_SQL = [
  ENTITIES_TABLE_SQL,
  TRANSACTIONS_TABLE_SQL,
  TRANSACTION_CORRECTIONS_TABLE_SQL,
  TRANSACTION_TAG_RULES_TABLE_SQL,
  TAG_VOCABULARY_TABLE_SQL,
  BUDGETS_TABLE_SQL,
  WISH_LIST_TABLE_SQL,
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
 * covers everything else. The backfill must already be ready for the
 * transactions cutover before that PR lands — this helper simulates the
 * post-cutover finance.db so the tests exercise the full TABLE_COPIES set.
 */
function openFinanceForCutover(path: string): ReturnType<typeof openFinanceDb> {
  const finance = openFinanceDb(path);
  finance.raw.exec(TRANSACTIONS_TABLE_SQL);
  return finance;
}

describe('backfillFinanceFromShared', () => {
  it('copies wish_list rows from the shared DB on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-1', 'Espresso machine', '2026-06-10T00:00:00Z')`
      );
      raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-2', 'Headphones', '2026-06-10T00:00:00Z')`
      );
    });

    const finance = openFinanceDb(join(tmpDir, 'finance.db'));
    try {
      backfillFinanceFromShared(finance, sharedPath);
      const rows = finance.raw.prepare('SELECT id, item FROM wish_list ORDER BY id').all() as {
        id: string;
        item: string;
      }[];
      expect(rows).toEqual([
        { id: 'wish-1', item: 'Espresso machine' },
        { id: 'wish-2', item: 'Headphones' },
      ]);
    } finally {
      finance.raw.close();
    }
  });

  it('is idempotent — a second run does not duplicate rows', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-1', 'Espresso machine', '2026-06-10T00:00:00Z')`
      );
    });

    const finance = openFinanceDb(join(tmpDir, 'finance.db'));
    try {
      backfillFinanceFromShared(finance, sharedPath);
      backfillFinanceFromShared(finance, sharedPath);
      const count = finance.raw.prepare('SELECT count(*) AS n FROM wish_list').get() as {
        n: number;
      };
      expect(count.n).toBe(1);
    } finally {
      finance.raw.close();
    }
  });

  it('only inserts rows missing from the finance copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-shared-only', 'Bike rack', '2026-06-10T00:00:00Z')`
      );
      raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-both', 'Espresso machine', '2026-06-10T00:00:00Z')`
      );
    });

    const finance = openFinanceDb(join(tmpDir, 'finance.db'));
    try {
      // Pre-seed the finance.db with one of the rows that also lives in
      // the shared DB; the backfill must skip it but pick up the other.
      finance.raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-both', 'Espresso machine', '2026-06-10T00:00:00Z')`
      );
      backfillFinanceFromShared(finance, sharedPath);
      const rows = finance.raw.prepare('SELECT id FROM wish_list ORDER BY id').all() as {
        id: string;
      }[];
      expect(rows.map((r) => r.id)).toEqual(['wish-both', 'wish-shared-only']);
    } finally {
      finance.raw.close();
    }
  });

  it('tolerates a shared DB with no finance-owned tables (post-PR-4 drop scenario)', () => {
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(`CREATE TABLE other_table (id integer PRIMARY KEY)`);
    raw.close();

    const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
    try {
      expect(() => backfillFinanceFromShared(finance, sharedPath)).not.toThrow();
      expect(countRows(finance.raw, 'wish_list')).toBe(0);
      expect(countRows(finance.raw, 'entities')).toBe(0);
      expect(countRows(finance.raw, 'transactions')).toBe(0);
      expect(countRows(finance.raw, 'transaction_corrections')).toBe(0);
      expect(countRows(finance.raw, 'transaction_tag_rules')).toBe(0);
      expect(countRows(finance.raw, 'budgets')).toBe(0);
      const seeded = countRows(finance.raw, 'tag_vocabulary');
      backfillFinanceFromShared(finance, sharedPath);
      expect(countRows(finance.raw, 'tag_vocabulary')).toBe(seeded);
    } finally {
      finance.raw.close();
    }
  });

  it('tolerates a shared DB missing only some finance tables (partial legacy)', () => {
    // Shared DB has wish_list + entities but no transactions / corrections /
    // tag rules / tag vocabulary / budgets. Backfill must copy what's there
    // and skip the rest without throwing.
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(ENTITIES_TABLE_SQL);
    raw.exec(WISH_LIST_TABLE_SQL);
    raw.exec(
      `INSERT INTO entities (id, name, last_edited_time) VALUES ('ent-1', 'Acme', '2026-06-10T00:00:00Z')`
    );
    raw.exec(
      `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-1', 'Coffee grinder', '2026-06-10T00:00:00Z')`
    );
    raw.close();

    const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
    try {
      expect(() => backfillFinanceFromShared(finance, sharedPath)).not.toThrow();
      expect(countRows(finance.raw, 'entities')).toBe(1);
      expect(countRows(finance.raw, 'wish_list')).toBe(1);
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

  describe('transaction_corrections', () => {
    it('copies corrections with FK to entities and is idempotent', () => {
      const sharedPath = openSharedWithSeed((raw) => {
        raw.exec(
          `INSERT INTO entities (id, name, last_edited_time) VALUES ('ent-1', 'Acme', '2026-06-10T00:00:00Z')`
        );
        raw.exec(
          `INSERT INTO transaction_corrections (id, description_pattern, entity_id) VALUES ('corr-1', 'COFFEE.*', 'ent-1')`
        );
      });

      const finance = openFinanceDb(join(tmpDir, 'finance.db'));
      try {
        backfillFinanceFromShared(finance, sharedPath);
        backfillFinanceFromShared(finance, sharedPath);
        const rows = finance.raw
          .prepare('SELECT id, entity_id FROM transaction_corrections ORDER BY id')
          .all() as { id: string; entity_id: string }[];
        expect(rows).toEqual([{ id: 'corr-1', entity_id: 'ent-1' }]);
      } finally {
        finance.raw.close();
      }
    });
  });

  describe('transaction_tag_rules', () => {
    it('copies tag rules with FK to entities and is idempotent', () => {
      const sharedPath = openSharedWithSeed((raw) => {
        raw.exec(
          `INSERT INTO entities (id, name, last_edited_time) VALUES ('ent-1', 'Acme', '2026-06-10T00:00:00Z')`
        );
        raw.exec(
          `INSERT INTO transaction_tag_rules (id, description_pattern, entity_id, tags) VALUES ('rule-1', 'COFFEE.*', 'ent-1', '["Coffee"]')`
        );
      });

      const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
      try {
        backfillFinanceFromShared(finance, sharedPath);
        backfillFinanceFromShared(finance, sharedPath);
        const rows = finance.raw
          .prepare('SELECT id, entity_id, tags FROM transaction_tag_rules ORDER BY id')
          .all() as { id: string; entity_id: string; tags: string }[];
        expect(rows).toEqual([{ id: 'rule-1', entity_id: 'ent-1', tags: '["Coffee"]' }]);
      } finally {
        finance.raw.close();
      }
    });
  });

  describe('tag_vocabulary', () => {
    it('copies user-source tags from the shared DB without duplicating seeded rows', () => {
      const sharedPath = openSharedWithSeed((raw) => {
        // The seed list lives in the finance-db baseline migration. Insert a
        // user-source tag here that is NOT in the seed list so we can assert
        // it lands without colliding with the seed.
        raw.exec(`INSERT INTO tag_vocabulary (tag, source) VALUES ('Avocado Toast', 'user')`);
      });

      const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
      try {
        const beforeCount = countRows(finance.raw, 'tag_vocabulary');
        backfillFinanceFromShared(finance, sharedPath);
        backfillFinanceFromShared(finance, sharedPath);
        const afterCount = countRows(finance.raw, 'tag_vocabulary');
        expect(afterCount).toBe(beforeCount + 1);
        const userTag = finance.raw
          .prepare(`SELECT tag, source FROM tag_vocabulary WHERE tag = 'Avocado Toast'`)
          .get() as { tag: string; source: string };
        expect(userTag).toEqual({ tag: 'Avocado Toast', source: 'user' });
      } finally {
        finance.raw.close();
      }
    });

    it('uses `tag` as the existence key — shared rows already present in finance are skipped', () => {
      // The seed list pre-loaded in openFinanceForCutover includes 'Groceries'.
      // If we insert it again from the shared DB with source='user', the
      // existence filter on `tag` (the PK) must skip it.
      const sharedPath = openSharedWithSeed((raw) => {
        raw.exec(`INSERT INTO tag_vocabulary (tag, source) VALUES ('Groceries', 'user')`);
      });

      const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
      try {
        const before = finance.raw
          .prepare(`SELECT source FROM tag_vocabulary WHERE tag = 'Groceries'`)
          .get() as { source: string };
        expect(before.source).toBe('seed');
        backfillFinanceFromShared(finance, sharedPath);
        const after = finance.raw
          .prepare(`SELECT source FROM tag_vocabulary WHERE tag = 'Groceries'`)
          .get() as { source: string };
        expect(after.source).toBe('seed');
      } finally {
        finance.raw.close();
      }
    });
  });

  describe('budgets', () => {
    it('copies budgets rows on first run and is idempotent', () => {
      const sharedPath = openSharedWithSeed((raw) => {
        raw.exec(
          `INSERT INTO budgets (id, category, period, amount, last_edited_time) VALUES ('bud-1', 'Groceries', '2026-06', 800.0, '2026-06-10T00:00:00Z')`
        );
        raw.exec(
          `INSERT INTO budgets (id, category, period, amount, last_edited_time) VALUES ('bud-2', 'Coffee', NULL, 60.0, '2026-06-10T00:00:00Z')`
        );
      });

      const finance = openFinanceDb(join(tmpDir, 'finance.db'));
      try {
        backfillFinanceFromShared(finance, sharedPath);
        backfillFinanceFromShared(finance, sharedPath);
        expect(countRows(finance.raw, 'budgets')).toBe(2);
      } finally {
        finance.raw.close();
      }
    });

    it('re-running does not violate the UNIQUE(category, COALESCE(period, char(0))) index', () => {
      // The `WHERE id NOT IN (...)` filter must protect the composite-unique
      // index from a re-insert that would otherwise duplicate (category, period)
      // for an already-copied row.
      const sharedPath = openSharedWithSeed((raw) => {
        raw.exec(
          `INSERT INTO budgets (id, category, period, amount, last_edited_time) VALUES ('bud-1', 'Groceries', '2026-06', 800.0, '2026-06-10T00:00:00Z')`
        );
      });

      const finance = openFinanceDb(join(tmpDir, 'finance.db'));
      try {
        backfillFinanceFromShared(finance, sharedPath);
        expect(() => backfillFinanceFromShared(finance, sharedPath)).not.toThrow();
        expect(countRows(finance.raw, 'budgets')).toBe(1);
      } finally {
        finance.raw.close();
      }
    });
  });

  describe('FK-safe ordering across the full finance set', () => {
    it('copies parents (entities) before children (transactions / corrections / tag rules) with foreign_keys = ON', () => {
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
        raw.exec(
          `INSERT INTO transaction_corrections (id, description_pattern, entity_id) VALUES ('corr-1', 'COFFEE.*', 'ent-1')`
        );
        raw.exec(
          `INSERT INTO transaction_tag_rules (id, description_pattern, entity_id, tags) VALUES ('rule-1', 'LUNCH.*', 'ent-2', '["Eat Out"]')`
        );
      });

      const finance = openFinanceForCutover(join(tmpDir, 'finance.db'));
      try {
        backfillFinanceFromShared(finance, sharedPath);
        expect(countRows(finance.raw, 'entities')).toBe(2);
        expect(countRows(finance.raw, 'transactions')).toBe(2);
        expect(countRows(finance.raw, 'transaction_corrections')).toBe(1);
        expect(countRows(finance.raw, 'transaction_tag_rules')).toBe(1);
      } finally {
        finance.raw.close();
      }
    });
  });
});
