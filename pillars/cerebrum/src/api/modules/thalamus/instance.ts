/**
 * Thalamus watcher singleton — owns the optional file-watcher lifetime and
 * wires it to the sync + embedding-trigger pipeline.
 *
 * The watcher is OPT-IN: `startThalamusWatcher` is a no-op unless
 * `CEREBRUM_INDEX_WATCH=true`, and it returns without starting if the engram
 * root does not exist. Tests never call it; `index.status` then reports
 * `watching: false`. `getThalamusWatcher` exposes the running instance (or null)
 * so the status proc can read its health.
 */
import { existsSync } from 'node:fs';

import { eq } from 'drizzle-orm';

import { type CerebrumDb, engramIndex } from '../../../db/index.js';
import { EmbeddingTrigger } from './embedding-trigger.js';
import { type EmbeddingsQueueAccessor } from './queue.js';
import { FrontmatterSyncService } from './sync.js';
import { FileWatcherService, type WatchEvent } from './watcher.js';

export const INDEX_WATCH_ENV = 'CEREBRUM_INDEX_WATCH';

export interface ThalamusWatcherDeps {
  db: CerebrumDb;
  engramRoot: string;
  queueAccessor: EmbeddingsQueueAccessor;
}

let watcher: FileWatcherService | null = null;

/** Returns the running watcher instance, or `null` when none is started. */
export function getThalamusWatcher(): FileWatcherService | null {
  return watcher;
}

/**
 * Start the thalamus file watcher when `CEREBRUM_INDEX_WATCH=true`. No-op when
 * the flag is unset/false, when a watcher is already running, or when the
 * engram root does not exist (logged, not thrown).
 */
export function startThalamusWatcher(
  deps: ThalamusWatcherDeps,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (watcher) return;
  if (env[INDEX_WATCH_ENV] !== 'true') return;

  if (!existsSync(deps.engramRoot)) {
    console.warn(
      `[thalamus] ${INDEX_WATCH_ENV}=true but engram root does not exist (${deps.engramRoot}) — ` +
        'watcher disabled.'
    );
    return;
  }

  const existingPaths = new Set(
    deps.db
      .select({ filePath: engramIndex.filePath })
      .from(engramIndex)
      .where(eq(engramIndex.status, 'active'))
      .all()
      .map((r) => r.filePath)
  );

  const sync = new FrontmatterSyncService(deps.engramRoot, deps.db);
  const trigger = new EmbeddingTrigger(deps.queueAccessor);

  const instance = new FileWatcherService(deps.engramRoot);
  instance.on('batch', (events: WatchEvent[]) => {
    const results = sync.processEvents(events);
    void trigger.trigger(results).catch((err: unknown) => {
      console.error('[thalamus] Error triggering embeddings:', err);
    });
  });
  instance.on('error', (err: Error) => {
    console.error('[thalamus] Watcher error:', err);
  });

  instance.start(existingPaths);
  watcher = instance;
  console.warn(`[thalamus] File watcher started (root: ${deps.engramRoot})`);
}

/** Stop the thalamus file watcher if running. */
export async function stopThalamusWatcher(): Promise<void> {
  if (watcher) {
    await watcher.stop();
    watcher = null;
    console.warn('[thalamus] File watcher stopped.');
  }
}
