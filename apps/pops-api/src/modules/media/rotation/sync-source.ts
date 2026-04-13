/**
 * Rotation source sync — fetches candidates from an adapter and
 * upserts them into the rotation_candidates table.
 *
 * PRD-071 US-02: syncSource(sourceId) implementation.
 */
import { rotationCandidates, rotationSources } from '@pops/db-types';
import { eq, sql } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import { getRegisteredTypes, getSourceAdapter } from './source-registry.js';

export interface SyncSourceResult {
  sourceId: number;
  sourceType: string;
  candidatesFetched: number;
  candidatesInserted: number;
  candidatesSkipped: number;
}

/**
 * Sync a rotation source: fetch candidates via its adapter and upsert
 * into the rotation_candidates table.
 */
export async function syncSource(sourceId: number): Promise<SyncSourceResult> {
  const db = getDrizzle();

  const source = db.select().from(rotationSources).where(eq(rotationSources.id, sourceId)).get();

  if (!source) {
    throw new Error(`Rotation source ${sourceId} not found`);
  }

  if (!source.enabled) {
    throw new Error(`Rotation source ${sourceId} (${source.name}) is disabled`);
  }

  const adapter = getSourceAdapter(source.type);
  if (!adapter) {
    throw new Error(
      `No adapter registered for source type "${source.type}". ` +
        `Registered types: ${JSON.stringify(getRegisteredTypes())}`
    );
  }

  const config: Record<string, unknown> = source.config
    ? (JSON.parse(source.config) as Record<string, unknown>)
    : {};

  const candidates = await adapter.fetchCandidates(config);

  let inserted = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const result = db
      .insert(rotationCandidates)
      .values({
        sourceId,
        tmdbId: candidate.tmdbId,
        title: candidate.title,
        year: candidate.year,
        rating: candidate.rating,
        posterPath: candidate.posterPath,
      })
      .onConflictDoNothing()
      .run();

    if (result.changes > 0) {
      inserted++;
    } else {
      skipped++;
    }
  }

  // Update lastSyncedAt on the source
  db.update(rotationSources)
    .set({ lastSyncedAt: sql`datetime('now')` })
    .where(eq(rotationSources.id, sourceId))
    .run();

  return {
    sourceId,
    sourceType: source.type,
    candidatesFetched: candidates.length,
    candidatesInserted: inserted,
    candidatesSkipped: skipped,
  };
}
