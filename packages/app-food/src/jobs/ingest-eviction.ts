/**
 * FIFO retention for `${FOOD_INGEST_DIR}`. The pipeline writes one
 * subdirectory per `ingest_sources.id`. This tick walks that root and,
 * when the count exceeds `MAX_INGEST_DIRS`, deletes the oldest (by
 * directory mtime) until the count is at the cap. For each evicted
 * directory it stamps `ingest_sources.archived_at` so the row keeps its
 * link to the recipe but the UI can tell the bytes are gone.
 *
 * Count-based eviction is a deliberate v1 simplification — there is no
 * byte-size target.
 */
import { type Stats } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { ingestSourcesService, type FoodDb } from '@pops/app-food-db';

const { markArchived } = ingestSourcesService;

/** Hard-coded cap; bump centrally if the disk math changes. */
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
  /**
   * Total source-ID subdirectories observed at the root BEFORE the tick.
   * Counts every per-source directory (numeric name), whether or not it
   * was within the in-flight grace. Non-numeric or non-directory entries
   * at the root are excluded.
   */
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
  if (!isAbsolute(dir)) {
    throw new Error(`runEvictionTick requires an absolute path; received "${dir}"`);
  }
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
  // Total-vs-eligible: if a huge backlog of in-flight dirs leaves few
  // eligible victims, we still need to claw the count down toward the cap
  // when the TOTAL exceeds it. Eviction is bounded by eligible.length,
  // never touches in-flight dirs.
  const overflow = Math.min(entries.length - MAX_INGEST_DIRS, eligible.length);
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
  try {
    for (const victim of victims) {
      await rm(victim.absolutePath, { recursive: true, force: true });
      evictedIds.push(victim.sourceId);
    }
  } finally {
    // Stamp `archived_at` for everything we actually removed even if a
    // later `rm` throws. Otherwise a transient I/O error on victim N
    // would leave victims 0..N-1 deleted from disk with no audit record.
    if (evictedIds.length > 0) markArchived(db, evictedIds);
  }
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
    let info: Stats;
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
