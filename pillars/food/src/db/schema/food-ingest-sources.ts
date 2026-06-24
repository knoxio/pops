/**
 * Provenance row per multimodal ingest run; FKs back to `recipes(id)` for
 * the drafted recipe.
 *
 * Path columns are stored relative to FOOD_INGEST_DIR. The absolute path is
 * computed at read time via `ingestDirFor(sourceId)` so deployments can
 * relocate the media root without rewriting rows.
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
    // Failure-band columns persist directly because the meta-JSON-only path
    // doesn't survive BullMQ TTL. Populated by `food.ingest.workerComplete`
    // on `ok: false`.
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    // Initialised to 0 by `food.ingest.start`; incremented by `food.ingest.retry`.
    attempts: integer('attempts').notNull().default(0),
    // Set when `food.inbox.approve` succeeds. NULL while the source is pending
    // review or rejected (reject is non-terminal — the row can be un-rejected
    // later). Lets the Drafts-tab query filter out approved sources without a
    // JOIN through `recipes.current_version_id`.
    reviewedAt: text('reviewed_at'),
  },
  (t) => [
    index('idx_ingest_sources_kind').on(t.kind),
    index('idx_ingest_sources_recipe').on(t.draftRecipeId),
    index('idx_ingest_sources_ingested').on(t.ingestedAt),
  ]
);
