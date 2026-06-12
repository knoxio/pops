/**
 * Boot-time backfill tests for `backfillCerebrumFromShared` (phase 2 PR 3).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * pillar's `cerebrum.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). Confirms:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the per-table WHERE filter dedupes),
 *   - mixed state (some rows already in cerebrum) only inserts the missing ones,
 *   - missing source table is tolerated without throwing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb } from '@pops/cerebrum-db';

import { backfillCerebrumFromShared } from './backfill-cerebrum-from-shared.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-backfill-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const NUDGE_LOG_SQL = `
CREATE TABLE nudge_log (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  engram_ids text NOT NULL,
  priority text NOT NULL,
  status text NOT NULL,
  created_at text NOT NULL,
  expires_at text,
  acted_at text,
  action_type text,
  action_label text,
  action_params text
);
`;

const GLIA_SCHEMA_SQL = `
CREATE TABLE glia_actions (
  id text PRIMARY KEY NOT NULL,
  action_type text NOT NULL,
  affected_ids text NOT NULL,
  rationale text NOT NULL,
  payload text,
  phase text NOT NULL,
  status text NOT NULL,
  user_decision text,
  user_note text,
  executed_at text,
  decided_at text,
  reverted_at text,
  created_at text NOT NULL
);
CREATE TABLE glia_trust_state (
  action_type text PRIMARY KEY NOT NULL,
  current_phase text NOT NULL,
  approved_count integer DEFAULT 0 NOT NULL,
  rejected_count integer DEFAULT 0 NOT NULL,
  reverted_count integer DEFAULT 0 NOT NULL,
  autonomous_since text,
  last_revert_at text,
  graduated_at text,
  updated_at text NOT NULL
);
`;

const CONVERSATIONS_SCHEMA_SQL = `
CREATE TABLE conversations (
  id text PRIMARY KEY NOT NULL,
  title text,
  active_scopes text NOT NULL,
  app_context text,
  model text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE messages (
  id text PRIMARY KEY NOT NULL,
  conversation_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  citations text,
  tool_calls text,
  tokens_in integer,
  tokens_out integer,
  created_at text NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE conversation_context (
  conversation_id text NOT NULL,
  engram_id text NOT NULL,
  relevance_score real,
  loaded_at text NOT NULL,
  PRIMARY KEY (conversation_id, engram_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade
);
`;

const ENGRAMS_SCHEMA_SQL = `
CREATE TABLE engram_index (
  id text PRIMARY KEY NOT NULL,
  file_path text NOT NULL,
  type text NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  template text,
  created_at text NOT NULL,
  modified_at text NOT NULL,
  title text NOT NULL,
  content_hash text NOT NULL,
  body_hash text,
  word_count integer NOT NULL,
  custom_fields text
);
CREATE TABLE engram_scopes (
  engram_id text NOT NULL,
  scope text NOT NULL,
  FOREIGN KEY (engram_id) REFERENCES engram_index(id) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX uq_engram_scopes_pair ON engram_scopes (engram_id, scope);
CREATE TABLE engram_tags (
  engram_id text NOT NULL,
  tag text NOT NULL,
  FOREIGN KEY (engram_id) REFERENCES engram_index(id) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX uq_engram_tags_pair ON engram_tags (engram_id, tag);
CREATE TABLE engram_links (
  source_id text NOT NULL,
  target_id text NOT NULL,
  FOREIGN KEY (source_id) REFERENCES engram_index(id) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX uq_engram_links_pair ON engram_links (source_id, target_id);
`;

function insertEngram(raw: BetterSqlite3.Database, id: string): void {
  raw
    .prepare(
      `INSERT INTO engram_index
        (id, file_path, type, source, status, created_at, modified_at, title, content_hash, word_count)
       VALUES (?, ?, 'note', 'manual', 'active', '2026-05-10T10:00:00Z', '2026-05-10T10:00:00Z', 'T', 'h', 1)`
    )
    .run(id, `notes/${id}.md`);
  raw.prepare(`INSERT INTO engram_scopes (engram_id, scope) VALUES (?, 'work')`).run(id);
  raw.prepare(`INSERT INTO engram_tags (engram_id, tag) VALUES (?, 'food')`).run(id);
}

function openSharedWithSeed(seed: (raw: BetterSqlite3.Database) => void): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(NUDGE_LOG_SQL);
  raw.exec(ENGRAMS_SCHEMA_SQL);
  raw.exec(GLIA_SCHEMA_SQL);
  raw.exec(CONVERSATIONS_SCHEMA_SQL);
  seed(raw);
  raw.close();
  return path;
}

function insertConversationRow(raw: BetterSqlite3.Database, id: string): void {
  raw
    .prepare(
      `INSERT INTO conversations
        (id, title, active_scopes, app_context, model, created_at, updated_at)
       VALUES (?, 'T', '[]', NULL, 'gpt-4', '2026-06-10T10:00:00Z', '2026-06-10T10:00:00Z')`
    )
    .run(id);
}

function insertMessageRow(raw: BetterSqlite3.Database, id: string, conversationId: string): void {
  raw
    .prepare(
      `INSERT INTO messages
        (id, conversation_id, role, content, created_at)
       VALUES (?, ?, 'user', 'hi', '2026-06-10T10:00:01Z')`
    )
    .run(id, conversationId);
}

function insertConversationContextRow(
  raw: BetterSqlite3.Database,
  conversationId: string,
  engramId: string
): void {
  raw
    .prepare(
      `INSERT INTO conversation_context
        (conversation_id, engram_id, relevance_score, loaded_at)
       VALUES (?, ?, 0.5, '2026-06-10T10:00:00Z')`
    )
    .run(conversationId, engramId);
}

function insertGliaAction(raw: BetterSqlite3.Database, id: string): void {
  raw
    .prepare(
      `INSERT INTO glia_actions
        (id, action_type, affected_ids, rationale, phase, status, created_at)
       VALUES (?, 'prune', '["eng_a"]', 'r', 'propose', 'pending', '2026-06-10T10:00:00Z')`
    )
    .run(id);
}

function insertGliaTrustState(raw: BetterSqlite3.Database, actionType: string): void {
  raw
    .prepare(
      `INSERT INTO glia_trust_state
        (action_type, current_phase, approved_count, rejected_count, reverted_count, updated_at)
       VALUES (?, 'propose', 0, 0, 0, '2026-06-10T10:00:00Z')`
    )
    .run(actionType);
}

function insertNudge(raw: BetterSqlite3.Database, id: string): void {
  raw
    .prepare(
      `INSERT INTO nudge_log
        (id, type, title, body, engram_ids, priority, status, created_at)
       VALUES (?, 'pattern', 'T', 'B', '[]', 'medium', 'pending', '2026-06-10T00:00:00Z')`
    )
    .run(id);
}

describe('backfillCerebrumFromShared', () => {
  it('copies nudge_log rows from the shared DB on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => insertNudge(raw, 'nudge-1'));

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const { n } = cerebrum.raw.prepare('SELECT count(*) AS n FROM nudge_log').get() as {
        n: number;
      };
      expect(n).toBe(1);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('is idempotent — a second run does not duplicate rows', () => {
    const sharedPath = openSharedWithSeed((raw) => insertNudge(raw, 'nudge-1'));

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      backfillCerebrumFromShared(cerebrum, sharedPath);
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const { n } = cerebrum.raw.prepare('SELECT count(*) AS n FROM nudge_log').get() as {
        n: number;
      };
      expect(n).toBe(1);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('only inserts rows missing from the cerebrum copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertNudge(raw, 'nudge-shared-only');
      insertNudge(raw, 'nudge-both');
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      // Pre-seed the cerebrum.db with one of the rows that also lives
      // in the shared DB; the backfill must skip it but pick up the other.
      insertNudge(cerebrum.raw, 'nudge-both');
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const rows = cerebrum.raw.prepare('SELECT id FROM nudge_log ORDER BY id').all() as {
        id: string;
      }[];
      expect(rows.map((r) => r.id)).toEqual(['nudge-both', 'nudge-shared-only']);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('copies engram_index + scopes + tags from the shared DB on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertEngram(raw, 'eng_20260510_1000_a');
      insertEngram(raw, 'eng_20260510_1000_b');
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const { engrams } = cerebrum.raw
        .prepare('SELECT count(*) AS engrams FROM engram_index')
        .get() as { engrams: number };
      const { scopes } = cerebrum.raw
        .prepare('SELECT count(*) AS scopes FROM engram_scopes')
        .get() as { scopes: number };
      const { tags } = cerebrum.raw.prepare('SELECT count(*) AS tags FROM engram_tags').get() as {
        tags: number;
      };
      expect(engrams).toBe(2);
      expect(scopes).toBe(2);
      expect(tags).toBe(2);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('skips engrams already present in the cerebrum copy (idempotent)', () => {
    const sharedPath = openSharedWithSeed((raw) => insertEngram(raw, 'eng_dup'));

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      backfillCerebrumFromShared(cerebrum, sharedPath);
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const { n } = cerebrum.raw.prepare('SELECT count(*) AS n FROM engram_index').get() as {
        n: number;
      };
      expect(n).toBe(1);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('copies glia_actions + glia_trust_state from the shared DB on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertGliaAction(raw, 'glia_a');
      insertGliaAction(raw, 'glia_b');
      insertGliaTrustState(raw, 'prune');
      insertGliaTrustState(raw, 'consolidate');
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const { actions } = cerebrum.raw
        .prepare('SELECT count(*) AS actions FROM glia_actions')
        .get() as { actions: number };
      const { trust } = cerebrum.raw
        .prepare('SELECT count(*) AS trust FROM glia_trust_state')
        .get() as { trust: number };
      expect(actions).toBe(2);
      expect(trust).toBe(2);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('skips glia rows already present in the cerebrum copy (idempotent)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertGliaAction(raw, 'glia_dup');
      insertGliaTrustState(raw, 'prune');
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      backfillCerebrumFromShared(cerebrum, sharedPath);
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const { actions } = cerebrum.raw
        .prepare('SELECT count(*) AS actions FROM glia_actions')
        .get() as { actions: number };
      const { trust } = cerebrum.raw
        .prepare('SELECT count(*) AS trust FROM glia_trust_state')
        .get() as { trust: number };
      expect(actions).toBe(1);
      expect(trust).toBe(1);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('only inserts glia rows missing from the cerebrum copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertGliaAction(raw, 'glia_shared_only');
      insertGliaAction(raw, 'glia_both');
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      insertGliaAction(cerebrum.raw, 'glia_both');
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const rows = cerebrum.raw.prepare('SELECT id FROM glia_actions ORDER BY id').all() as {
        id: string;
      }[];
      expect(rows.map((r) => r.id)).toEqual(['glia_both', 'glia_shared_only']);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('copies conversations + messages + conversation_context on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertConversationRow(raw, 'conv_a');
      insertConversationRow(raw, 'conv_b');
      insertMessageRow(raw, 'msg_a1', 'conv_a');
      insertMessageRow(raw, 'msg_a2', 'conv_a');
      insertConversationContextRow(raw, 'conv_a', 'eng_a');
      insertConversationContextRow(raw, 'conv_b', 'eng_b');
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const { convs } = cerebrum.raw
        .prepare('SELECT count(*) AS convs FROM conversations')
        .get() as { convs: number };
      const { msgs } = cerebrum.raw.prepare('SELECT count(*) AS msgs FROM messages').get() as {
        msgs: number;
      };
      const { ctx } = cerebrum.raw
        .prepare('SELECT count(*) AS ctx FROM conversation_context')
        .get() as { ctx: number };
      expect(convs).toBe(2);
      expect(msgs).toBe(2);
      expect(ctx).toBe(2);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('skips conversation rows already present in the cerebrum copy (idempotent)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertConversationRow(raw, 'conv_dup');
      insertMessageRow(raw, 'msg_dup', 'conv_dup');
      insertConversationContextRow(raw, 'conv_dup', 'eng_dup');
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      backfillCerebrumFromShared(cerebrum, sharedPath);
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const { convs } = cerebrum.raw
        .prepare('SELECT count(*) AS convs FROM conversations')
        .get() as { convs: number };
      const { msgs } = cerebrum.raw.prepare('SELECT count(*) AS msgs FROM messages').get() as {
        msgs: number;
      };
      const { ctx } = cerebrum.raw
        .prepare('SELECT count(*) AS ctx FROM conversation_context')
        .get() as { ctx: number };
      expect(convs).toBe(1);
      expect(msgs).toBe(1);
      expect(ctx).toBe(1);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('only inserts conversation rows missing from the cerebrum copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertConversationRow(raw, 'conv_shared_only');
      insertConversationRow(raw, 'conv_both');
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      insertConversationRow(cerebrum.raw, 'conv_both');
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const rows = cerebrum.raw.prepare('SELECT id FROM conversations ORDER BY id').all() as {
        id: string;
      }[];
      expect(rows.map((r) => r.id)).toEqual(['conv_both', 'conv_shared_only']);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('tolerates a shared DB with no cerebrum tables (post-PR-4 drop scenario)', () => {
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(`CREATE TABLE other_table (id integer PRIMARY KEY)`);
    raw.close();

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      expect(() => backfillCerebrumFromShared(cerebrum, sharedPath)).not.toThrow();
      const { n } = cerebrum.raw.prepare('SELECT count(*) AS n FROM nudge_log').get() as {
        n: number;
      };
      expect(n).toBe(0);
    } finally {
      cerebrum.raw.close();
    }
  });
});
