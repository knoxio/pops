/**
 * FileWatcherService — watches the engram root directory with chokidar and
 * emits debounced `WatchEvent` batches so the sync pipeline can index changes
 * incrementally without hammering the DB on every keystroke.
 *
 * Opt-in: started only by `instance.ts` when `CEREBRUM_INDEX_WATCH=true`. Tests
 * never start a watcher; `index.status` reports `watching: false` when none is
 * running. The `reindex` / `reconcile` procs operate on the engram root + index
 * directly and do NOT require a live watcher.
 *
 * Reconciliation: on the `ready` event (after chokidar's initial scan) the
 * service compares discovered paths to the `existingPaths` set provided by the
 * caller. Any file present on disk but absent from the index gets a synthetic
 * `create` event so it can be caught up.
 */
import EventEmitter from 'node:events';
import { relative } from 'node:path';

import { watch as chokidarWatch, type FSWatcher } from 'chokidar';

export type WatchEventType = 'create' | 'modify' | 'delete';

export interface WatchEvent {
  type: WatchEventType;
  filePath: string;
}

export interface WatcherHealth {
  watching: boolean;
  lastEventAt: string | null;
  watchedPaths: number;
}

const EMFILE_POLL_INTERVAL_MS = 60_000;

export class FileWatcherService extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private readonly pendingEventTypes = new Map<string, WatchEventType>();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastEventAt: string | null = null;
  private readonly root: string;
  private readonly debounceMs: number;
  private readonly discoveredPaths = new Set<string>();
  private ready = false;

  constructor(root: string, debounceMs = 500) {
    super();
    this.root = root;
    this.debounceMs = debounceMs;
  }

  /**
   * Start watching the root directory.
   *
   * @param existingPaths Relative paths currently indexed (used for
   *   reconciliation: files on disk but not in this set get a `create` event).
   */
  start(existingPaths: Set<string>): void {
    if (this.watcher) return;

    const watchOptions: Parameters<typeof chokidarWatch>[1] = {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      usePolling: false,
    };

    let watcher: FSWatcher;
    try {
      watcher = chokidarWatch(this.root, watchOptions);
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      return;
    }

    this.attachErrorHandler(watcher, watchOptions, existingPaths);
    this.watcher = watcher;
    this.attachHandlers(watcher, existingPaths);
  }

  /** Stop the watcher and clear all pending timers. */
  async stop(): Promise<void> {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.pendingEventTypes.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.ready = false;
    this.discoveredPaths.clear();
  }

  health(): WatcherHealth {
    const watchedPaths = this.watcher
      ? Object.keys(this.watcher.getWatched()).reduce(
          (sum, dir) => sum + (this.watcher?.getWatched()[dir]?.length ?? 0),
          0
        )
      : 0;
    return {
      watching: this.watcher !== null,
      lastEventAt: this.lastEventAt,
      watchedPaths,
    };
  }

  private attachErrorHandler(
    w: FSWatcher,
    watchOptions: Parameters<typeof chokidarWatch>[1],
    existingPaths: Set<string>
  ): void {
    w.on('error', (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      if ((error as NodeJS.ErrnoException).code === 'EMFILE') {
        console.error(
          '[thalamus] EMFILE: too many open files — falling back to polling (interval: 60s)'
        );
        void w.close().then(() => {
          this.watcher = null;
          const pollingOptions = {
            ...watchOptions,
            usePolling: true,
            interval: EMFILE_POLL_INTERVAL_MS,
          };
          const pollingWatcher = chokidarWatch(this.root, pollingOptions);
          this.watcher = pollingWatcher;
          this.attachErrorHandler(pollingWatcher, watchOptions, existingPaths);
          this.attachHandlers(pollingWatcher, existingPaths);
        });
      } else {
        this.emit('error', error);
      }
    });
  }

  private attachHandlers(watcher: FSWatcher, existingPaths: Set<string>): void {
    watcher.on('add', (filePath: string) => {
      const rel = this.toRel(filePath);
      if (!rel) return;
      if (!this.ready) {
        this.discoveredPaths.add(rel);
      } else {
        this.scheduleEvent(rel, 'create');
      }
    });

    watcher.on('change', (filePath: string) => {
      const rel = this.toRel(filePath);
      if (rel) this.scheduleEvent(rel, 'modify');
    });

    watcher.on('unlink', (filePath: string) => {
      const rel = this.toRel(filePath);
      if (rel) this.scheduleEvent(rel, 'delete');
    });

    watcher.on('ready', () => {
      this.ready = true;
      this.reconcile(existingPaths);
    });
  }

  private reconcile(existingPaths: Set<string>): void {
    const toCreate = [...this.discoveredPaths].filter((p) => !existingPaths.has(p));
    this.discoveredPaths.clear();

    if (toCreate.length === 0) {
      this.emit('reconciled');
      return;
    }

    const BATCH = 100;
    let offset = 0;

    const flush = (): void => {
      const slice = toCreate.slice(offset, offset + BATCH);
      offset += BATCH;
      for (const rel of slice) this.scheduleEvent(rel, 'create');
      if (offset < toCreate.length) {
        setImmediate(flush);
      } else {
        this.emit('reconciled');
      }
    };

    setImmediate(flush);
  }

  private scheduleEvent(relPath: string, type: WatchEventType): void {
    const current = this.pendingEventTypes.get(relPath);
    if (current !== 'delete' && (type === 'delete' || current === undefined || type === 'create')) {
      this.pendingEventTypes.set(relPath, type);
    }
    this.lastEventAt = new Date().toISOString();

    const existing = this.debounceTimers.get(relPath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(relPath);
      const resolvedType = this.pendingEventTypes.get(relPath);
      this.pendingEventTypes.delete(relPath);
      if (resolvedType) {
        this.emit('batch', [{ type: resolvedType, filePath: relPath }]);
      }
    }, this.debounceMs);

    this.debounceTimers.set(relPath, timer);
  }

  /** Convert an absolute path to a root-relative forward-slash path. Only .md files pass. */
  private toRel(absPath: string): string | null {
    if (!absPath.endsWith('.md')) return null;
    const rel = relative(this.root, absPath).replaceAll('\\', '/');
    if (rel.startsWith('..') || rel.startsWith('.')) return null;
    return rel;
  }
}
