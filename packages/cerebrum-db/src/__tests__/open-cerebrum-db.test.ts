/**
 * Smoke tests for the standalone `openCerebrumDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB. Covers both the nudge_log slice (Track M5)
 * and the engrams baseline (PRD-179 US-01).
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb } from '../open-cerebrum-db.js';
import { embeddings, engramIndex, nudgeLog } from '../schema.js';
import { upsertEngramIndex } from '../services/engrams.js';
import { persistCandidates } from '../services/nudge-log.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openCerebrumDb', () => {
  it('creates the parent directory and opens a fresh DB', () => {
    const path = join(tmpDir, 'nested', 'sub', 'cerebrum.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openCerebrumDb(path, { loadVec: false });
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the nudge_log migration and accepts writes via the service', () => {
    const path = join(tmpDir, 'cerebrum.db');
    const { db, raw } = openCerebrumDb(path, { loadVec: false });
    try {
      expect(db.select().from(nudgeLog).all()).toHaveLength(0);
      const created = persistCandidates(
        db,
        [
          {
            type: 'pattern',
            title: 'T',
            body: 'B',
            engramIds: ['e1'],
            priority: 'medium',
            expiresAt: null,
            action: null,
          },
        ],
        { nudgeCooldownHours: 24 }
      );
      expect(created).toBe(1);
      expect(db.select().from(nudgeLog).all()).toHaveLength(1);
    } finally {
      raw.close();
    }
  });

  it('applies the engrams baseline and accepts writes via the service', () => {
    const path = join(tmpDir, 'cerebrum.db');
    const { db, raw } = openCerebrumDb(path, { loadVec: false });
    try {
      expect(db.select().from(engramIndex).all()).toHaveLength(0);
      upsertEngramIndex(db, {
        id: 'eng_20260510_1000_test',
        filePath: 'notes/eng_20260510_1000_test.md',
        type: 'note',
        source: 'manual',
        status: 'active',
        template: null,
        createdAt: '2026-05-10T10:00:00Z',
        modifiedAt: '2026-05-10T10:00:00Z',
        title: 'T',
        contentHash: 'h',
        bodyHash: 'bh',
        wordCount: 1,
        customFields: {},
        scopes: ['work'],
        tags: [],
        links: [],
      });
      expect(db.select().from(engramIndex).all()).toHaveLength(1);
    } finally {
      raw.close();
    }
  });

  it('applies the embeddings baseline with the documented schema (PRD-076)', () => {
    const path = join(tmpDir, 'cerebrum.db');
    const { db, raw } = openCerebrumDb(path, { loadVec: false });
    try {
      expect(db.select().from(embeddings).all()).toHaveLength(0);

      const inserted = db
        .insert(embeddings)
        .values({
          sourceType: 'transactions',
          sourceId: 'tx-1',
          chunkIndex: 0,
          contentHash: 'h',
          contentPreview: 'preview',
          model: 'text-embedding-3-small',
          dimensions: 1536,
          createdAt: '2026-06-13T00:00:00Z',
        })
        .returning({ id: embeddings.id })
        .all();
      expect(inserted).toHaveLength(1);
      expect(typeof inserted[0].id).toBe('number');

      const indexes = raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='embeddings'`)
        .all() as { name: string }[];
      const names = indexes.map((r) => r.name).toSorted();
      expect(names).toContain('uq_embeddings_source_chunk');
      expect(names).toContain('idx_embeddings_source_type');
      expect(names).toContain('idx_embeddings_content_hash');

      expect(() =>
        db
          .insert(embeddings)
          .values({
            sourceType: 'transactions',
            sourceId: 'tx-1',
            chunkIndex: 0,
            contentHash: 'h2',
            contentPreview: 'preview2',
            model: 'text-embedding-3-small',
            dimensions: 1536,
            createdAt: '2026-06-13T00:00:00Z',
          })
          .run()
      ).toThrow(/UNIQUE/i);
    } finally {
      raw.close();
    }
  });

  it('skips sqlite-vec when loadVec is false and reports vecAvailable=false', () => {
    const path = join(tmpDir, 'cerebrum.db');
    const opened = openCerebrumDb(path, { loadVec: false });
    try {
      expect(opened.vecAvailable).toBe(false);
      const row = opened.raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings_vec'`)
        .get();
      expect(row).toBeUndefined();
    } finally {
      opened.raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations', () => {
    const path = join(tmpDir, 'cerebrum.db');
    const first = openCerebrumDb(path, { loadVec: false });
    try {
      persistCandidates(
        first.db,
        [
          {
            type: 'pattern',
            title: 'T',
            body: 'B',
            engramIds: ['e1'],
            priority: 'medium',
            expiresAt: null,
            action: null,
          },
        ],
        { nudgeCooldownHours: 24 }
      );
      expect(first.db.select().from(nudgeLog).all()).toHaveLength(1);
    } finally {
      first.raw.close();
    }

    const second = openCerebrumDb(path, { loadVec: false });
    try {
      expect(second.db.select().from(nudgeLog).all()).toHaveLength(1);
    } finally {
      second.raw.close();
    }
  });
});
