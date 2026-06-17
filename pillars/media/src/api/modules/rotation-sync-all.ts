/**
 * Batch source sync with per-source interval gating (api-layer).
 *
 * Ported from the monolith `sync-source.ts` `syncAllSources` (the data-plane
 * slice deferred batching + interval gating to this scheduler slice). Syncs
 * every enabled source whose `sync_interval_hours` has elapsed since its last
 * sync; each source is independent so one failure never blocks the others. A
 * module-level guard prevents concurrent syncs of the same source.
 */
import { type MediaDb, rotationSourcesService } from '../../db/index.js';
import { type SyncSourceResult, syncSource } from './rotation-source-sync.js';

const DEFAULT_SYNC_INTERVAL_HOURS = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

export interface SyncAllResult {
  synced: SyncSourceResult[];
  skipped: number;
  errors: { sourceId: number; sourceName: string; error: string }[];
}

const syncingSourceIds = new Set<number>();

function intervalElapsed(lastSyncedAt: string | null, intervalHours: number): boolean {
  if (!lastSyncedAt) return true;
  const elapsed = Date.now() - new Date(lastSyncedAt).getTime();
  return elapsed >= (intervalHours || DEFAULT_SYNC_INTERVAL_HOURS) * MS_PER_HOUR;
}

/**
 * Sync all enabled sources whose interval has elapsed. Sources synced too
 * recently — or already mid-sync — count toward `skipped`. Errors are
 * collected per source rather than thrown.
 */
export async function syncAllSources(db: MediaDb): Promise<SyncAllResult> {
  const sources = rotationSourcesService.listSources(db).filter((s) => s.enabled === 1);

  const synced: SyncSourceResult[] = [];
  const errors: SyncAllResult['errors'] = [];
  let skipped = 0;

  for (const source of sources) {
    if (!intervalElapsed(source.lastSyncedAt, source.syncIntervalHours)) {
      skipped++;
      continue;
    }
    if (syncingSourceIds.has(source.id)) {
      skipped++;
      continue;
    }

    syncingSourceIds.add(source.id);
    try {
      synced.push(await syncSource(db, source.id));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push({ sourceId: source.id, sourceName: source.name, error });
      console.error(`[rotation] Source sync failed for "${source.name}": ${error}`);
    } finally {
      syncingSourceIds.delete(source.id);
    }
  }

  return { synced, skipped, errors };
}
