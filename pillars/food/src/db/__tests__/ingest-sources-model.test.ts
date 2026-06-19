/**
 * PRD-110 invariant tests — exercises the ingest_sources schema and
 * service layer against an in-memory SQLite seeded with PRDs 106 + 107 +
 * 110 migrations.
 */

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { IngestSourceNotFound, IngestSourceUrlRequired } from '../errors.js';
import { openFoodDb } from '../open-food-db.js';
import { ingestSources, recipes } from '../schema.js';
import { createIngestSource, linkDraftRecipe, markArchived } from '../services/ingest-sources.js';
import { type FoodDb } from '../services/internal.js';
import { createRecipe } from '../services/recipes.js';

import type Database from 'better-sqlite3';

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

describe('PRD-110 — ingest_sources schema', () => {
  let db: FoodDb;
  let raw: Database.Database;

  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  describe('schema applied cleanly', () => {
    it('creates the ingest_sources table', () => {
      const tables = raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as { name: string }[];
      expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(['ingest_sources']));
    });

    it('creates the three documented indexes', () => {
      const indexes = raw
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ingest_sources' ORDER BY name`
        )
        .all() as { name: string }[];
      const names = indexes.map((i) => i.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'idx_ingest_sources_ingested',
          'idx_ingest_sources_kind',
          'idx_ingest_sources_recipe',
        ])
      );
    });

    it('exposes the kind CHECK constraint via the create-statement', () => {
      const row = raw.prepare(`SELECT sql FROM sqlite_master WHERE name='ingest_sources'`).get() as
        | { sql: string }
        | undefined;
      expect(row?.sql).toMatch(/CHECK.*kind.*url-web.*url-instagram.*text.*screenshot/);
    });
  });

  describe('kind CHECK invariant', () => {
    it('rejects unknown kind values', () => {
      expect(() =>
        raw
          .prepare(
            `INSERT INTO ingest_sources (kind, extractor_version) VALUES ('voicemail', 'pipeline-v1')`
          )
          .run()
      ).toThrow();
    });

    it('accepts each of the four documented kinds', () => {
      for (const kind of ['url-web', 'url-instagram', 'text', 'screenshot']) {
        const url = kind.startsWith('url-') ? 'https://example.test/' : null;
        const row = createIngestSource(db, {
          kind: kind as 'url-web' | 'url-instagram' | 'text' | 'screenshot',
          extractorVersion: 'pipeline-v1',
          url,
        });
        expect(row.kind).toBe(kind);
      }
    });
  });

  describe('NOT NULL invariants', () => {
    it('extractor_version cannot be null at the SQL layer', () => {
      expect(() =>
        raw.prepare(`INSERT INTO ingest_sources (kind) VALUES ('text')`).run()
      ).toThrow();
    });

    it('ingested_at defaults to datetime("now")', () => {
      const row = createIngestSource(db, {
        kind: 'text',
        extractorVersion: 'pipeline-v1',
      });
      expect(row.ingestedAt).toBeTruthy();
      expect(row.ingestedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('service: createIngestSource', () => {
    it('throws IngestSourceUrlRequired when kind=url-web without url', () => {
      expect(() =>
        createIngestSource(db, { kind: 'url-web', extractorVersion: 'pipeline-v1' })
      ).toThrow(IngestSourceUrlRequired);
    });

    it('throws IngestSourceUrlRequired when kind=url-instagram without url', () => {
      expect(() =>
        createIngestSource(db, { kind: 'url-instagram', extractorVersion: 'pipeline-v1' })
      ).toThrow(IngestSourceUrlRequired);
    });

    it('accepts kind=text without url', () => {
      const row = createIngestSource(db, {
        kind: 'text',
        extractorVersion: 'pipeline-v1',
        caption: 'just a paste',
      });
      expect(row.url).toBeNull();
    });

    it('accepts kind=screenshot without url', () => {
      const row = createIngestSource(db, {
        kind: 'screenshot',
        extractorVersion: 'pipeline-v1',
      });
      expect(row.url).toBeNull();
    });

    it('stores path columns verbatim', () => {
      const row = createIngestSource(db, {
        kind: 'url-instagram',
        extractorVersion: 'pipeline-v1;whisper-distil',
        url: 'https://instagram.com/reel/abc',
        videoPath: '17/video.mp4',
        transcriptPath: '17/transcript.vtt',
        keyframesDir: '17/keyframes',
      });
      expect(row.videoPath).toBe('17/video.mp4');
      expect(row.transcriptPath).toBe('17/transcript.vtt');
      expect(row.keyframesDir).toBe('17/keyframes');
    });
  });

  describe('FK to recipes', () => {
    it('linkDraftRecipe sets draft_recipe_id', () => {
      const { recipe } = createRecipe(db, {
        slug: 'pad-thai',
        firstVersion: { title: 'Pad Thai', bodyDsl: '@recipe(pad-thai)' },
      });
      const source = createIngestSource(db, {
        kind: 'text',
        extractorVersion: 'pipeline-v1',
      });
      const linked = linkDraftRecipe(db, source.id, recipe.id);
      expect(linked.draftRecipeId).toBe(recipe.id);
    });

    it('linkDraftRecipe on a missing source raises IngestSourceNotFound', () => {
      expect(() => linkDraftRecipe(db, 9999, 1)).toThrow(IngestSourceNotFound);
    });

    it('rejects inserts that point at non-existent recipes (FK enforced)', () => {
      expect(() =>
        raw
          .prepare(
            `INSERT INTO ingest_sources (kind, extractor_version, draft_recipe_id) VALUES ('text', 'pipeline-v1', 9999)`
          )
          .run()
      ).toThrow();
    });

    it('keeps the FK populated even after the recipe is soft-archived', () => {
      const { recipe } = createRecipe(db, {
        slug: 'pad-thai',
        firstVersion: { title: 'Pad Thai', bodyDsl: '@recipe(pad-thai)' },
      });
      const source = createIngestSource(db, {
        kind: 'text',
        extractorVersion: 'pipeline-v1',
        draftRecipeId: recipe.id,
      });
      raw.prepare(`UPDATE recipes SET archived_at = datetime('now') WHERE id = ?`).run(recipe.id);
      const reread = db.select().from(ingestSources).where(eq(ingestSources.id, source.id)).all();
      expect(reread[0]?.draftRecipeId).toBe(recipe.id);
    });
  });

  describe('archived_at lifecycle', () => {
    it('markArchived sets archived_at without clearing path columns', () => {
      const source = createIngestSource(db, {
        kind: 'url-web',
        extractorVersion: 'pipeline-v1',
        url: 'https://example.test/recipe',
        caption: 'web-extracted body',
      });
      markArchived(db, [source.id]);
      const reread = db.select().from(ingestSources).where(eq(ingestSources.id, source.id)).all();
      expect(reread[0]?.archivedAt).not.toBeNull();
      // Path columns are intentionally preserved per PRD-110.
      expect(reread[0]?.caption).toBe('web-extracted body');
    });

    it('markArchived is a no-op for unknown ids', () => {
      expect(() => markArchived(db, [9999])).not.toThrow();
    });
  });

  describe('PRD-107 cross-ref — recipe_versions.source_id', () => {
    it('source_id is a plain integer (no FK enforcement yet)', () => {
      // PRD-107 declared source_id as a plain integer so PRD-110 could land
      // without a forward-FK migration. Retrofitting the FK is queued as a
      // future amendment; meanwhile inserting a phantom source_id succeeds.
      const { recipe } = createRecipe(db, {
        slug: 'phantom',
        firstVersion: { title: 'Phantom', bodyDsl: '@recipe(phantom)' },
      });
      expect(() =>
        raw
          .prepare(`UPDATE recipe_versions SET source_id = 9999 WHERE recipe_id = ?`)
          .run(recipe.id)
      ).not.toThrow();
      const row = db.select().from(recipes).where(eq(recipes.id, recipe.id)).all();
      expect(row[0]?.id).toBe(recipe.id);
    });
  });
});
