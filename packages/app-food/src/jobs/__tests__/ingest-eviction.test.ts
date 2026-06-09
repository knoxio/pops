/**
 * PRD-110 retention-job tests.
 *
 * Seeds N fake source directories under a tempdir, runs the eviction
 * tick, and asserts the FIFO cap is enforced + matching `ingest_sources`
 * rows get `archived_at` set.
 */
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ingestSources, ingestSourcesService, type FoodDb } from '@pops/app-food-db';

import { IN_FLIGHT_GRACE_MS, MAX_INGEST_DIRS, runEvictionTick } from '../ingest-eviction';

const { createIngestSource } = ingestSourcesService;

const MIGRATIONS = [
  '0058_high_sentinel.sql',
  '0059_useful_hiroim.sql',
  '0060_familiar_leo.sql',
  '0061_shocking_skreet.sql',
  '0063_bumpy_wolverine.sql',
  '0064_peaceful_magma.sql',
].map((name) =>
  readFileSync(
    join(__dirname, '../../../../../apps/pops-api/src/db/drizzle-migrations', name),
    'utf8'
  )
);

function freshDb(): FoodDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    for (const stmt of migration.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) raw.exec(trimmed);
    }
  }
  return drizzle(raw);
}

async function seedSourceDir(
  root: string,
  sourceId: number,
  mtimeSecondsAgo: number
): Promise<void> {
  const dir = join(root, String(sourceId));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'meta.json'), `{"sourceId":${sourceId}}`);
  const ts = new Date(Date.now() - mtimeSecondsAgo * 1000);
  await utimes(dir, ts, ts);
}

describe('PRD-110 — runEvictionTick', () => {
  let workdir: string;
  let db: FoodDb;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'pops-prd110-'));
    db = freshDb();
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('returns an empty result when the root has no source dirs', async () => {
    const result = await runEvictionTick(db, workdir);
    expect(result.evictedIds).toEqual([]);
    expect(result.consideredCount).toBe(0);
    expect(result.skippedInFlight).toEqual([]);
  });

  it('returns an empty result when the root does not exist', async () => {
    const result = await runEvictionTick(db, join(workdir, 'missing'));
    expect(result.evictedIds).toEqual([]);
  });

  it('leaves everything alone when count <= MAX_INGEST_DIRS', async () => {
    for (let i = 1; i <= 10; i += 1) {
      await seedSourceDir(workdir, i, /* mtime older than the grace */ 600);
      createIngestSource(db, { kind: 'text', extractorVersion: 'pipeline-v1' });
    }
    const result = await runEvictionTick(db, workdir);
    expect(result.evictedIds).toEqual([]);
    const remaining = await readdir(workdir);
    expect(remaining).toHaveLength(10);
  });

  it('evicts the 5 oldest dirs when count = 105 and stamps archived_at', async () => {
    // Seed 105 ingest_sources rows so the on-disk source IDs match.
    for (let i = 0; i < 105; i += 1) {
      createIngestSource(db, { kind: 'text', extractorVersion: 'pipeline-v1' });
    }
    // Seed 105 dirs with strictly increasing mtime so the 5 youngest by id
    // are also the 5 youngest by mtime.
    for (let id = 1; id <= 105; id += 1) {
      const ageSec = (110 - id) * 60; // id=1 oldest, id=105 youngest
      // Always older than the in-flight grace.
      const safeAge = Math.max(ageSec, IN_FLIGHT_GRACE_MS / 1000 + 5);
      await seedSourceDir(workdir, id, safeAge);
    }
    const result = await runEvictionTick(db, workdir);
    expect(result.evictedIds).toEqual([1, 2, 3, 4, 5]);
    expect(result.consideredCount).toBe(105);
    const remaining = await readdir(workdir);
    expect(remaining).toHaveLength(MAX_INGEST_DIRS);
    // The 5 evicted rows now have archived_at set; the other 100 don't.
    const archivedRows = db.select().from(ingestSources).all();
    const archived = archivedRows.filter((r) => r.archivedAt !== null);
    expect(archived.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('skips dirs whose mtime is within the in-flight grace window', async () => {
    for (let i = 0; i < 105; i += 1) {
      createIngestSource(db, { kind: 'text', extractorVersion: 'pipeline-v1' });
    }
    // 100 mature dirs (id 6-105) + 5 freshly-touched dirs (id 1-5).
    for (let id = 1; id <= 105; id += 1) {
      const ageSec = id <= 5 ? 1 : 86_400 + id;
      await seedSourceDir(workdir, id, ageSec);
    }
    const result = await runEvictionTick(db, workdir);
    expect(result.skippedInFlight.toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    // Total is 105 (>100), eligible is 100; overflow = min(5, 100) = 5, so
    // the 5 oldest mature dirs (highest ages) get evicted to bring total
    // down toward the cap. In-flight dirs are never touched.
    expect(result.evictedIds.toSorted((a, b) => a - b)).toEqual([101, 102, 103, 104, 105]);
    const remaining = await readdir(workdir);
    expect(remaining).toHaveLength(100);
  });

  it('rejects a relative dir argument', async () => {
    await expect(runEvictionTick(db, 'relative/path')).rejects.toThrow(/absolute path/);
  });

  it('still evicts mature dirs when in-flight backlog pushes the total past the cap', async () => {
    // 110 in-flight dirs (id 1-110) + 5 mature dirs (id 111-115) = 115 total.
    // entries.length - MAX = 15, eligible.length = 5 → overflow = min(15, 5) = 5.
    for (let i = 0; i < 115; i += 1) {
      createIngestSource(db, { kind: 'text', extractorVersion: 'pipeline-v1' });
    }
    for (let id = 1; id <= 110; id += 1) {
      await seedSourceDir(workdir, id, 1); // in-flight
    }
    for (let id = 111; id <= 115; id += 1) {
      await seedSourceDir(workdir, id, IN_FLIGHT_GRACE_MS / 1000 + (200 - id));
    }
    const result = await runEvictionTick(db, workdir);
    expect(result.evictedIds.toSorted((a, b) => a - b)).toEqual([111, 112, 113, 114, 115]);
    expect(result.skippedInFlight).toHaveLength(110);
    const remaining = await readdir(workdir);
    expect(remaining).toHaveLength(110); // all the in-flight ones, untouched
  });

  it('ignores non-numeric and non-directory entries at the root', async () => {
    for (let id = 1; id <= 102; id += 1) {
      createIngestSource(db, { kind: 'text', extractorVersion: 'pipeline-v1' });
      await seedSourceDir(workdir, id, IN_FLIGHT_GRACE_MS / 1000 + (200 - id));
    }
    // Stray files / dirs that aren't source IDs.
    await writeFile(join(workdir, 'README.txt'), 'hi');
    await mkdir(join(workdir, '.tmp'));
    const result = await runEvictionTick(db, workdir);
    expect(result.consideredCount).toBe(102);
    expect(result.evictedIds).toHaveLength(2);
    // The strays are still on disk.
    const names = await readdir(workdir);
    expect(names).toContain('README.txt');
    expect(names).toContain('.tmp');
  });
});
