import { eq, sql } from 'drizzle-orm';

/**
 * Rotation source sync — fetches candidates from an adapter and
 * upserts them into the rotation_candidates table.
 *
 * PRD-071 US-02: syncSource(sourceId) implementation.
 * PRD-071 US-07: syncAllSources() — batch sync with interval gating.
 */
import { rotationCandidates, rotationExclusions, rotationSources } from '@pops/db-types';

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

  // Build set of excluded tmdb_ids for status assignment during upsert
  const excludedTmdbIds = new Set(
    db
      .select({ tmdbId: rotationExclusions.tmdbId })
      .from(rotationExclusions)
      .all()
      .map((r) => r.tmdbId)
  );

  let inserted = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const status = excludedTmdbIds.has(candidate.tmdbId) ? 'excluded' : 'pending';
    const result = db
      .insert(rotationCandidates)
      .values({
        sourceId,
        tmdbId: candidate.tmdbId,
        title: candidate.title,
        year: candidate.year,
        rating: candidate.rating,
        posterPath: candidate.posterPath,
        status,
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

// ---------------------------------------------------------------------------
// Concurrency guard — prevents duplicate syncs for the same source
// ---------------------------------------------------------------------------

const syncingSourceIds = new Set<number>();

export function isSourceSyncing(sourceId: number): boolean {
  return syncingSourceIds.has(sourceId);
}

// ---------------------------------------------------------------------------
// syncAllSources — batch sync with per-source interval gating
// ---------------------------------------------------------------------------

export interface SyncAllResult {
  synced: SyncSourceResult[];
  skipped: number;
  errors: { sourceId: number; sourceName: string; error: string }[];
}

/**
 * Sync all enabled sources whose sync interval has elapsed.
 * Each source is synced independently — one failure does not block others.
 */
export async function syncAllSources(): Promise<SyncAllResult> {
  const db = getDrizzle();

  const sources = db.select().from(rotationSources).where(eq(rotationSources.enabled, 1)).all();

  const synced: SyncSourceResult[] = [];
  const errors: SyncAllResult['errors'] = [];
  let skipped = 0;

  for (const source of sources) {
    // Check interval: skip if synced recently
    if (source.lastSyncedAt) {
      const lastSynced = new Date(source.lastSyncedAt).getTime();
      const intervalMs = (source.syncIntervalHours ?? 24) * 60 * 60 * 1000;
      if (Date.now() - lastSynced < intervalMs) {
        skipped++;
        continue;
      }
    }

    // Concurrency guard
    if (syncingSourceIds.has(source.id)) {
      skipped++;
      continue;
    }

    syncingSourceIds.add(source.id);
    try {
      const result = await syncSource(source.id);
      synced.push(result);
      console.warn(
        `[Rotation] Synced source "${source.name}" (${source.type}): ${result.candidatesFetched} fetched, ${result.candidatesInserted} new`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ sourceId: source.id, sourceName: source.name, error: message });
      console.error(`[Rotation] Sync failed for source "${source.name}": ${message}`);
    } finally {
      syncingSourceIds.delete(source.id);
    }
  }

  console.warn(
    `[Rotation] Source sync complete: ${synced.length} synced, ${skipped} skipped, ${errors.length} errors`
  );

  return { synced, skipped, errors };
}
