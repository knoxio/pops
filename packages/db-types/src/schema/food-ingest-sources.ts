/**
 * Food domain — PRD-110 schema (ingest_sources).
 *
 *   ingest_sources        — provenance row per multimodal ingest run; FKs
 *                           back to recipes(id) for the drafted recipe.
 *
 * Path columns are stored relative to FOOD_INGEST_DIR. The absolute path is
 * computed at read time via `ingestDirFor(sourceId)` (see
 * `packages/app-food/src/storage/ingest-paths.ts`) so deployments can
 * relocate the media root without rewriting rows.
 *
 * See `docs/themes/07-food/prds/110-ingest-sources/README.md`.
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { recipes } from './food-recipes.js';

export const ingestSources = sqliteTable(
  'ingest_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', {
      enum: ['url-web', 'url-instagram', 'text', 'screenshot'],
    }).notNull(),
    url: text('url'),
    caption: text('caption'),
    transcriptPath: text('transcript_path'),
    keyframesDir: text('keyframes_dir'),
    videoPath: text('video_path'),
    extractedJson: text('extracted_json'),
    extractorVersion: text('extractor_version').notNull(),
    draftRecipeId: integer('draft_recipe_id').references(() => recipes.id),
    ingestedAt: text('ingested_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    // Set when the FIFO eviction job removes this source's media files. The
    // row persists; only the files are gone. Path columns stay populated to
    // describe where the files used to be.
    archivedAt: text('archived_at'),
  },
  (t) => [
    index('idx_ingest_sources_kind').on(t.kind),
    index('idx_ingest_sources_recipe').on(t.draftRecipeId),
    index('idx_ingest_sources_ingested').on(t.ingestedAt),
  ]
);
