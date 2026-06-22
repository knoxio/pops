/**
 * Coverage for `0054_finance_pillar_baseline_extension.sql` — the
 * follow-up migration that creates the three finance tables absent from
 * the 0053 baseline (`transactions`, `transaction_tag_rules`,
 * `tag_vocabulary`).
 *
 * Track N4 (#2908) flipped `transaction_tag_rules` consumers to
 * `getFinanceDrizzle()` but the table was only created by the legacy
 * shared `0000_naive_chameleon.sql` / `0026_little_frank_castle.sql`
 * statements — on a fresh per-pillar `finance.db` populated solely by
 * 0053 the table did not exist.
 *
 * The migration uses CREATE TABLE / CREATE INDEX IF NOT EXISTS so
 * replaying it against a production `finance.db` populated by the
 * legacy boot path (where `transaction_tag_rules` already exists from
 * the shared journal) is a no-op rather than an error.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb } from '../open-finance-db.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-db-extension-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

interface TableInfoRow {
  name: string;
}

interface ForeignKeyRow {
  table: string;
  from: string;
  to: string;
  on_delete: string;
}

interface IndexInfoRow {
  name: string;
}

function listTables(raw: Database.Database): string[] {
  return (
    raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as TableInfoRow[]
  ).map((row) => row.name);
}

function listIndexes(raw: Database.Database, table: string): string[] {
  return (raw.prepare(`PRAGMA index_list(${table})`).all() as IndexInfoRow[]).map(
    (row) => row.name
  );
}

describe('0054_finance_pillar_baseline_extension', () => {
  it('creates transactions, transaction_tag_rules, and tag_vocabulary on a fresh finance.db', () => {
    const path = join(tmpDir, 'finance.db');
    const { raw } = openFinanceDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      const tables = listTables(raw);
      expect(tables).toContain('transactions');
      expect(tables).toContain('transaction_tag_rules');
      expect(tables).toContain('tag_vocabulary');
    } finally {
      raw.close();
    }
  });

  it('has dropped the transaction_tag_rules.entity_id → entities FK (0057)', () => {
    const path = join(tmpDir, 'finance.db');
    const { raw } = openFinanceDb(path);
    try {
      // 0057 rebuilt the table without the FK: entity_id now holds a contacts
      // entity id with no local referent (PRD-163 US-03).
      const fks = raw
        .prepare('PRAGMA foreign_key_list(transaction_tag_rules)')
        .all() as ForeignKeyRow[];
      expect(fks.find((fk) => fk.from === 'entity_id')).toBeUndefined();
    } finally {
      raw.close();
    }
  });

  it('creates every named index from the migration', () => {
    const path = join(tmpDir, 'finance.db');
    const { raw } = openFinanceDb(path);
    try {
      const transactionsIndexes = listIndexes(raw, 'transactions');
      expect(transactionsIndexes).toEqual(
        expect.arrayContaining([
          'idx_transactions_date',
          'idx_transactions_account',
          'idx_transactions_entity',
          'idx_transactions_last_edited',
          'idx_transactions_notion_id',
          'idx_transactions_checksum',
          'transactions_notion_id_unique',
        ])
      );

      const tagRulesIndexes = listIndexes(raw, 'transaction_tag_rules');
      expect(tagRulesIndexes).toEqual(
        expect.arrayContaining([
          'idx_tag_rules_pattern',
          'idx_tag_rules_entity_id',
          'idx_tag_rules_priority',
          'idx_tag_rules_confidence',
          'idx_tag_rules_times_applied',
        ])
      );

      const tagVocabIndexes = listIndexes(raw, 'tag_vocabulary');
      expect(tagVocabIndexes).toEqual(expect.arrayContaining(['idx_tag_vocabulary_active']));
    } finally {
      raw.close();
    }
  });

  it('supports round-trip insert + read against each new table', () => {
    const path = join(tmpDir, 'finance.db');
    const { raw } = openFinanceDb(path);
    try {
      raw
        .prepare(
          `INSERT INTO transactions
             (id, description, account, amount, date, type, last_edited_time)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          'txn-1',
          'Test charge',
          'Up Savings',
          12.5,
          '2026-06-01',
          'Purchase',
          '2026-06-01T00:00:00Z'
        );

      raw
        .prepare(
          `INSERT INTO transaction_tag_rules
             (id, description_pattern, match_type, tags, is_active, confidence, priority, times_applied, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
        .run('rule-1', 'WOOLWORTHS%', 'contains', '["Groceries"]', 1, 0.75, 10, 0);

      raw
        .prepare(
          `INSERT INTO tag_vocabulary
             (tag, source, is_active, created_at)
           VALUES (?, ?, ?, datetime('now'))`
        )
        .run('Custom Tag', 'user', 1);

      const txn = raw
        .prepare('SELECT id, description, account, amount FROM transactions WHERE id = ?')
        .get('txn-1') as { id: string; description: string; account: string; amount: number };
      expect(txn).toEqual({
        id: 'txn-1',
        description: 'Test charge',
        account: 'Up Savings',
        amount: 12.5,
      });

      const rule = raw
        .prepare(
          'SELECT id, description_pattern, match_type, tags, confidence FROM transaction_tag_rules WHERE id = ?'
        )
        .get('rule-1') as {
        id: string;
        description_pattern: string;
        match_type: string;
        tags: string;
        confidence: number;
      };
      expect(rule).toEqual({
        id: 'rule-1',
        description_pattern: 'WOOLWORTHS%',
        match_type: 'contains',
        tags: '["Groceries"]',
        confidence: 0.75,
      });

      const tag = raw
        .prepare('SELECT tag, source, is_active FROM tag_vocabulary WHERE tag = ?')
        .get('Custom Tag') as { tag: string; source: string; is_active: number };
      expect(tag).toEqual({ tag: 'Custom Tag', source: 'user', is_active: 1 });
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-running migrations against an already-populated finance.db is a no-op', () => {
    const path = join(tmpDir, 'finance.db');

    const first = openFinanceDb(path);
    try {
      first.raw
        .prepare(
          `INSERT INTO transactions
             (id, description, account, amount, date, type, last_edited_time)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          'seed-1',
          'Seed row',
          'Up Savings',
          1,
          '2026-06-01',
          'Purchase',
          '2026-06-01T00:00:00Z'
        );
    } finally {
      first.raw.close();
    }

    expect(() => {
      const second = openFinanceDb(path);
      try {
        const txn = second.raw.prepare('SELECT id FROM transactions WHERE id = ?').get('seed-1') as
          | { id: string }
          | undefined;
        expect(txn?.id).toBe('seed-1');
      } finally {
        second.raw.close();
      }
    }).not.toThrow();
  });

  it('applies cleanly when the target tables already exist (production-upgrade scenario)', () => {
    const path = join(tmpDir, 'finance-prefilled.db');

    const first = openFinanceDb(path);
    try {
      first.raw
        .prepare(
          `INSERT INTO transactions
             (id, description, account, amount, date, type, last_edited_time)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          'legacy-1',
          'Legacy charge',
          'Up Savings',
          1,
          '2026-06-01',
          'Purchase',
          '2026-06-01T00:00:00Z'
        );
    } finally {
      first.raw.close();
    }

    const raw = new Database(path);
    raw.pragma('journal_mode = WAL');
    const beforeRows = (
      raw.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as { n: number }
    ).n;
    // Wipe every drizzle migration row whose `created_at` is at or below
    // 0054's `when` (1778500000001 — see `migrations/meta/_journal.json`).
    // That makes drizzle re-replay 0054 (idempotent thanks to `IF NOT
    // EXISTS`) on reopen, while leaving newer ALTER-TABLE migrations
    // (0055+) recorded so they are NOT replayed against columns that
    // already exist. Targeting "the latest row" would instead force a
    // re-replay of whichever migration happens to sit at the head of the
    // journal — not the production-upgrade scenario this suite covers.
    const deleteInfo = raw
      .prepare('DELETE FROM __drizzle_migrations WHERE created_at <= ?')
      .run(1778500000001);
    expect(deleteInfo.changes).toBeGreaterThan(0);
    const afterRows = (
      raw.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as { n: number }
    ).n;
    raw.close();
    expect(afterRows).toBeLessThan(beforeRows);

    expect(() => {
      const reopened = openFinanceDb(path);
      try {
        const txn = reopened.raw
          .prepare('SELECT id FROM transactions WHERE id = ?')
          .get('legacy-1') as { id: string } | undefined;
        expect(txn?.id).toBe('legacy-1');
        const tables = listTables(reopened.raw);
        expect(tables).toContain('transactions');
        expect(tables).toContain('transaction_tag_rules');
        expect(tables).toContain('tag_vocabulary');
      } finally {
        reopened.raw.close();
      }
    }).not.toThrow();
  });
});
