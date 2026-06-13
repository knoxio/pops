/**
 * Boot-time backfill tests for `backfillCerebrumFromShared`.
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * pillar's `cerebrum.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). After the cerebrum PR4 drop, only `nudge_log`
 * still rides the bridge — engrams, plexus, glia, and conversations
 * write directly to `cerebrum.db`. Confirms:
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

const EMBEDDINGS_SQL = `
CREATE TABLE embeddings (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  chunk_index integer DEFAULT 0 NOT NULL,
  content_hash text NOT NULL,
  content_preview text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL,
  created_at text NOT NULL
);
CREATE UNIQUE INDEX uq_embeddings_source_chunk
  ON embeddings (source_type, source_id, chunk_index);
`;

const DEBRIEF_SQL = `
CREATE TABLE debrief_sessions (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  watch_history_id integer NOT NULL,
  media_type text,
  media_id integer,
  status text DEFAULT 'pending' NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX idx_debrief_sessions_media ON debrief_sessions (media_type, media_id);
CREATE TABLE debrief_results (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  session_id integer NOT NULL,
  dimension_id integer NOT NULL,
  comparison_id integer,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE TABLE debrief_status (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  media_type text NOT NULL,
  media_id integer NOT NULL,
  dimension_id integer NOT NULL,
  debriefed integer DEFAULT 0 NOT NULL,
  dismissed integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  updated_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE UNIQUE INDEX debrief_status_media_dimension_idx
  ON debrief_status (media_type, media_id, dimension_id);
`;

function openSharedWithSeed(seed: (raw: BetterSqlite3.Database) => void): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(NUDGE_LOG_SQL);
  raw.exec(EMBEDDINGS_SQL);
  raw.exec(DEBRIEF_SQL);
  seed(raw);
  raw.close();
  return path;
}

function insertDebriefSession(
  raw: BetterSqlite3.Database,
  watchHistoryId: number,
  mediaId: number
): number {
  const result = raw
    .prepare(
      `INSERT INTO debrief_sessions
        (watch_history_id, media_type, media_id, status, created_at)
       VALUES (?, 'movie', ?, 'pending', '2026-06-13T00:00:00Z')`
    )
    .run(watchHistoryId, mediaId);
  return Number(result.lastInsertRowid);
}

function insertDebriefStatus(
  raw: BetterSqlite3.Database,
  mediaId: number,
  dimensionId: number
): void {
  raw
    .prepare(
      `INSERT INTO debrief_status
        (media_type, media_id, dimension_id, debriefed, dismissed, created_at, updated_at)
       VALUES ('movie', ?, ?, 0, 0, '2026-06-13T00:00:00Z', '2026-06-13T00:00:00Z')`
    )
    .run(mediaId, dimensionId);
}

function insertEmbedding(raw: BetterSqlite3.Database, sourceId: string, chunkIndex = 0): void {
  raw
    .prepare(
      `INSERT INTO embeddings
        (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES ('transactions', ?, ?, 'h', 'preview', 'text-embedding-3-small', 1536, '2026-06-13T00:00:00Z')`
    )
    .run(sourceId, chunkIndex);
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

  it('copies embeddings rows and dedupes on (source_type, source_id, chunk_index)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertEmbedding(raw, 'tx-shared-only', 0);
      insertEmbedding(raw, 'tx-both', 0);
      insertEmbedding(raw, 'tx-both', 1);
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      insertEmbedding(cerebrum.raw, 'tx-both', 0);
      backfillCerebrumFromShared(cerebrum, sharedPath);
      backfillCerebrumFromShared(cerebrum, sharedPath);

      const rows = cerebrum.raw
        .prepare('SELECT source_id, chunk_index FROM embeddings ORDER BY source_id, chunk_index')
        .all() as { source_id: string; chunk_index: number }[];
      expect(rows).toEqual([
        { source_id: 'tx-both', chunk_index: 0 },
        { source_id: 'tx-both', chunk_index: 1 },
        { source_id: 'tx-shared-only', chunk_index: 0 },
      ]);
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

  it('copies debrief_sessions / debrief_results / debrief_status rows on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      const sessionId = insertDebriefSession(raw, 11, 101);
      raw
        .prepare(
          `INSERT INTO debrief_results (session_id, dimension_id, comparison_id, created_at)
           VALUES (?, 1, NULL, '2026-06-13T00:00:00Z')`
        )
        .run(sessionId);
      insertDebriefStatus(raw, 101, 1);
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      backfillCerebrumFromShared(cerebrum, sharedPath);
      const sessions = cerebrum.raw.prepare('SELECT count(*) AS n FROM debrief_sessions').get() as {
        n: number;
      };
      const results = cerebrum.raw.prepare('SELECT count(*) AS n FROM debrief_results').get() as {
        n: number;
      };
      const status = cerebrum.raw.prepare('SELECT count(*) AS n FROM debrief_status').get() as {
        n: number;
      };
      expect(sessions.n).toBe(1);
      expect(results.n).toBe(1);
      expect(status.n).toBe(1);

      const result = cerebrum.raw.prepare('SELECT session_id FROM debrief_results').get() as {
        session_id: number;
      };
      const session = cerebrum.raw.prepare('SELECT id FROM debrief_sessions').get() as {
        id: number;
      };
      expect(result.session_id).toBe(session.id);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('debrief backfill is idempotent across re-runs', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertDebriefSession(raw, 11, 101);
      insertDebriefStatus(raw, 101, 1);
      insertDebriefStatus(raw, 101, 2);
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      backfillCerebrumFromShared(cerebrum, sharedPath);
      backfillCerebrumFromShared(cerebrum, sharedPath);

      const { n: sessions } = cerebrum.raw
        .prepare('SELECT count(*) AS n FROM debrief_sessions')
        .get() as { n: number };
      const { n: status } = cerebrum.raw
        .prepare('SELECT count(*) AS n FROM debrief_status')
        .get() as { n: number };
      expect(sessions).toBe(1);
      expect(status).toBe(2);
    } finally {
      cerebrum.raw.close();
    }
  });

  it('debrief_status dedupes on (media_type, media_id, dimension_id) under mixed state', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertDebriefStatus(raw, 101, 1);
      insertDebriefStatus(raw, 101, 2);
    });

    const cerebrum = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
    try {
      cerebrum.raw
        .prepare(
          `INSERT INTO debrief_status (media_type, media_id, dimension_id) VALUES ('movie', 101, 1)`
        )
        .run();
      backfillCerebrumFromShared(cerebrum, sharedPath);

      const rows = cerebrum.raw
        .prepare(
          'SELECT media_id, dimension_id FROM debrief_status ORDER BY media_id, dimension_id'
        )
        .all() as { media_id: number; dimension_id: number }[];
      expect(rows).toEqual([
        { media_id: 101, dimension_id: 1 },
        { media_id: 101, dimension_id: 2 },
      ]);
    } finally {
      cerebrum.raw.close();
    }
  });
});
