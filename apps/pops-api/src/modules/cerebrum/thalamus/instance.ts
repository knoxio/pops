/**
 * Thalamus singleton — owns the file watcher lifetime and wires up the
 * sync + embedding-trigger pipeline.
 *
 * Call `startThalamus()` once at server startup and `stopThalamus()` during
 * graceful shutdown.  The watcher is optional: if ENGRAM_ROOT doesn't exist
 * the function logs a warning and returns without crashing.
 */
import { existsSync } from 'node:fs';

import { eq } from 'drizzle-orm';

import { engramIndex } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { DEFAULT_JOB_OPTIONS, getDefaultQueue } from '../../../jobs/queues.js';
import { getEngramRoot } from '../instance.js';
import { EmbeddingTrigger } from './embedding-trigger.js';
import { FrontmatterSyncService } from './sync.js';
import { FileWatcherService } from './watcher.js';

import type { WatchEvent } from './watcher.js';

const CROSS_SOURCE_SCHEDULER_ID = 'pops-cross-source-index';
const CROSS_SOURCE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let watcher: FileWatcherService | null = null;

/** Returns the current watcher instance (or null if not started). */
export function getFileWatcher(): FileWatcherService | null {
  return watcher;
}

/** Start the Thalamus file watcher and sync pipeline. */
export async function startThalamus(): Promise<void> {
  if (watcher) return; // already running

  const root = getEngramRoot();

  if (!existsSync(root)) {
    console.warn(
      `[thalamus] ENGRAM_ROOT does not exist (${root}) — file watcher disabled. ` +
        `Create the directory and restart to enable.`
    );
    return;
  }

  const db = getDrizzle();

  // Build the set of paths currently in the index so the watcher can
  // reconcile files that were modified while the server was down.
  const existingPaths = new Set(
    db
      .select({ filePath: engramIndex.filePath })
      .from(engramIndex)
      .where(eq(engramIndex.status, 'active'))
      .all()
      .map((r) => r.filePath)
  );

  const sync = new FrontmatterSyncService(root, db);
  const trigger = new EmbeddingTrigger();

  watcher = new FileWatcherService(root);

  watcher.on('batch', (events: WatchEvent[]) => {
    sync
      .processEvents(events)
      .then((results) => trigger.trigger(results))
      .catch((err: unknown) => {
        console.error('[thalamus] Error processing batch:', err);
      });
  });

  watcher.on('error', (err: Error) => {
    console.error('[thalamus] Watcher error:', err);
  });

  watcher.on('reconciled', () => {
    console.warn('[thalamus] Initial reconciliation complete.');
  });

  watcher.start(existingPaths);
  console.warn(`[thalamus] File watcher started (root: ${root})`);

  // Register cross-source index repeatable job (every 6 hours).
  void getDefaultQueue()
    .upsertJobScheduler(
      CROSS_SOURCE_SCHEDULER_ID,
      { every: CROSS_SOURCE_INTERVAL_MS },
      { name: 'crossSourceIndex', data: { type: 'crossSourceIndex' }, opts: DEFAULT_JOB_OPTIONS }
    )
    .catch((err: unknown) => {
      console.error('[thalamus] Failed to register cross-source index scheduler:', err);
    });
}

/** Stop the Thalamus file watcher and deregister the cross-source scheduler. */
export async function stopThalamus(): Promise<void> {
  void getDefaultQueue()
    .removeJobScheduler(CROSS_SOURCE_SCHEDULER_ID)
    .catch((err: unknown) => {
      console.error('[thalamus] Failed to remove cross-source index scheduler:', err);
    });

  if (watcher) {
    await watcher.stop();
    watcher = null;
    console.warn('[thalamus] File watcher stopped.');
  }
}
