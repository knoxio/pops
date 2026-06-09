/**
 * FIFO retention job for the food ingest media directory (PRD-110).
 *
 * The pipeline writes one subdirectory per `ingest_sources.id` under
 * `${FOOD_INGEST_DIR}`. This tick walks that root, and when the count
 * exceeds `MAX_INGEST_DIRS` deletes the oldest (by directory mtime) until
 * the count is at the cap. For each evicted directory it sets
 * `ingest_sources.archived_at` so the row keeps its link to the recipe
 * but the UI can tell the bytes are gone.
 *
 * The PRD's "5 GB target" is not enforced here — count-based eviction is
 * a deliberate v1 simplification (PRD-110 §Retention Policy).
 *
 * Scheduling lives in Epic 02's worker config. This module just exposes
 * `runEvictionTick(db, dir)` so the worker, a one-shot CLI, and the unit
 * tests can all invoke the same logic.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { markArchived } from '../db/services/ingest-sources';
import { type FoodDb } from '../db/services/internal';

/** Cap from PRD-110. Hard-coded; bumped centrally if the disk math changes. */
export const MAX_INGEST_DIRS = 100;

/**
 * Skip directories whose mtime is newer than this many milliseconds — an
 * in-flight ingest is writing to it and racing the eviction would corrupt
 * the half-written tree.
 */
export const IN_FLIGHT_GRACE_MS = 60_000;

export interface EvictionResult {
  /** Source-IDs the tick removed from disk. */
  evictedIds: readonly number[];
  /** Total subdirectory count BEFORE the tick (after the in-flight skip). */
  consideredCount: number;
  /** Source-IDs skipped because they were within the in-flight grace window. */
  skippedInFlight: readonly number[];
}

interface DirEntry {
  sourceId: number;
  absolutePath: string;
  mtimeMs: number;
}

/**
 * Walk `dir`, drop the oldest-mtime subdirs beyond `MAX_INGEST_DIRS`, and
 * stamp `archived_at` on the matching `ingest_sources` rows.
 *
 * `dir` must be an absolute path. The caller is expected to use
 * `ingestRootDir()` from `../storage/ingest-paths`.
 */
export async function runEvictionTick(db: FoodDb, dir: string): Promise<EvictionResult> {
  const entries = await listSourceDirs(dir);
  const now = Date.now();
  const skippedInFlight: number[] = [];
  const eligible: DirEntry[] = [];
  for (const entry of entries) {
    if (now - entry.mtimeMs < IN_FLIGHT_GRACE_MS) {
      skippedInFlight.push(entry.sourceId);
      continue;
    }
    eligible.push(entry);
  }
  const overflow = eligible.length - MAX_INGEST_DIRS;
  if (overflow <= 0) {
    return {
      evictedIds: [],
      consideredCount: entries.length,
      skippedInFlight,
    };
  }
  // Oldest first (smaller mtime = older); stable for equal mtimes via id.
  eligible.sort((a, b) => a.mtimeMs - b.mtimeMs || a.sourceId - b.sourceId);
  const victims = eligible.slice(0, overflow);
  const evictedIds: number[] = [];
  for (const victim of victims) {
    await rm(victim.absolutePath, { recursive: true, force: true });
    evictedIds.push(victim.sourceId);
  }
  if (evictedIds.length > 0) markArchived(db, evictedIds);
  return {
    evictedIds,
    consideredCount: entries.length,
    skippedInFlight,
  };
}

async function listSourceDirs(dir: string): Promise<DirEntry[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if (isNoSuchFileError(err)) return [];
    throw err;
  }
  const entries: DirEntry[] = [];
  for (const name of names) {
    // Source-IDs are positive integers. Anything else (a stray file, a
    // hidden dotfile) is ignored — the eviction job never touches it.
    if (!/^\d+$/.test(name)) continue;
    const sourceId = Number.parseInt(name, 10);
    if (!Number.isFinite(sourceId) || sourceId <= 0) continue;
    const absolutePath = join(dir, name);
    let info;
    try {
      info = await stat(absolutePath);
    } catch (err) {
      if (isNoSuchFileError(err)) continue;
      throw err;
    }
    if (!info.isDirectory()) continue;
    entries.push({ sourceId, absolutePath, mtimeMs: info.mtimeMs });
  }
  return entries;
}

function isNoSuchFileError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}
