/**
 * Rotation source sync orchestration (api-layer).
 *
 * Fetches candidates from a source adapter and upserts them into the
 * `rotation_candidates` table. This is an api-layer concern (it calls the
 * upstream TMDB / Plex clients), NOT a db service — the `src/db` layer stays
 * HTTP-free. Ported from the monolith `sync-source.ts` (the single-source
 * path). The batch `syncAllSources` + per-source interval gating lives in
 * `rotation-sync-all.ts`, which the rotation cycle drives each tick.
 */
import {
  type MediaDb,
  RotationSourceDisabledError,
  RotationSourceNotFoundError,
  rotationCandidateSyncService,
  rotationExclusionsService,
  rotationSourcesService,
} from '../../db/index.js';
import { getPlexClientId, getPlexToken } from '../clients/plex/index.js';
import { registerRotationSources } from './rotation-register-sources.js';
import { getRegisteredTypes, getSourceAdapter } from './rotation-source-registry.js';

import type { RotationSourceDeps } from './rotation-source-types.js';

export interface SyncSourceResult {
  sourceId: number;
  sourceType: string;
  candidatesFetched: number;
  candidatesInserted: number;
  candidatesSkipped: number;
}

function parseConfig(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function resolvePlexDeps(db: MediaDb): RotationSourceDeps {
  const plexToken = getPlexToken(db);
  return {
    plexToken,
    plexClientId: plexToken === null ? null : getPlexClientId(db),
  };
}

/**
 * Sync a single rotation source: fetch via its adapter and upsert into the
 * candidates table. Throws {@link RotationSourceNotFoundError} /
 * {@link RotationSourceDisabledError} for missing/disabled sources.
 */
export async function syncSource(db: MediaDb, sourceId: number): Promise<SyncSourceResult> {
  registerRotationSources();

  const source = rotationSourcesService.getSource(db, sourceId);
  if (!source) throw new RotationSourceNotFoundError(sourceId);
  if (!source.enabled) throw new RotationSourceDisabledError(sourceId, source.name);

  const adapter = getSourceAdapter(source.type);
  if (!adapter) {
    throw new Error(
      `No adapter registered for source type "${source.type}". ` +
        `Registered types: ${JSON.stringify(getRegisteredTypes())}`
    );
  }

  const config = parseConfig(source.config);
  const candidates = await adapter.fetchCandidates(config, resolvePlexDeps(db));
  const excludedTmdbIds = rotationExclusionsService.getExcludedTmdbIds(db);
  const { inserted, skipped } = rotationCandidateSyncService.upsertFetchedCandidates(
    db,
    sourceId,
    candidates,
    excludedTmdbIds
  );
  rotationCandidateSyncService.touchSourceSyncedAt(db, sourceId);

  return {
    sourceId,
    sourceType: source.type,
    candidatesFetched: candidates.length,
    candidatesInserted: inserted,
    candidatesSkipped: skipped,
  };
}
