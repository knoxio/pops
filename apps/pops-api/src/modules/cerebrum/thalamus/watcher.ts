/**
 * FileWatcherService — watches the engram root directory with chokidar and
 * emits debounced `WatchEvent` batches so the sync pipeline can index changes
 * incrementally without hammering the DB on every keystroke.
 *
 * Reconciliation: on the `ready` event (after chokidar's initial scan) the
 * service compares discovered paths to the `existingPaths` set provided by
 * the caller. Any file present on disk but absent from the index gets a
 * synthetic `create` event so it can be caught up.
 */
import EventEmitter from 'node:events';
import { relative } from 'node:path';

import { watch as chokidarWatch, type FSWatcher } from 'chokidar';

export type WatchEventType = 'create' | 'modify' | 'delete';

export interface WatchEvent {
  type: WatchEventType;
  filePath: string;
}

export class FileWatcherService extends EventEmitter {
  private watcher: FSWatcher | null = null;
  /** Tracks the "highest priority" event type seen before the debounce fires. */
  private readonly pendingEventTypes = new Map<string, WatchEventType>();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private _lastEventAt: string | null = null;
  private readonly root: string;
  private readonly debounceMs: number;
  /** Paths discovered during chokidar's initial scan (relative, forward-slash). */
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

    const attachErrorHandler = (w: FSWatcher): void => {
      w.on('error', (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        if ((error as NodeJS.ErrnoException).code === 'EMFILE') {
          console.error(
            '[thalamus] EMFILE: too many open files — falling back to polling (interval: 60s)'
          );
          void w.close().then(() => {
            this.watcher = null;
            const pollingOptions = { ...watchOptions, usePolling: true, interval: 60_000 };
            const pollingWatcher = chokidarWatch(this.root, pollingOptions);
            this.watcher = pollingWatcher;
            attachErrorHandler(pollingWatcher);
            this.attachHandlers(pollingWatcher, existingPaths);
          });
        } else {
          this.emit('error', error);
        }
      });
    };
    // Handle EMFILE by falling back to polling.
    attachErrorHandler(watcher);

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

  health(): { watching: boolean; lastEventAt: string | null; watchedPaths: number } {
    const watchedPaths = this.watcher
      ? Object.keys(this.watcher.getWatched()).reduce(
          (sum, dir) => sum + (this.watcher?.getWatched()[dir]?.length ?? 0),
          0
        )
      : 0;
    return {
      watching: this.watcher !== null,
      lastEventAt: this._lastEventAt,
      watchedPaths,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private attachHandlers(watcher: FSWatcher, existingPaths: Set<string>): void {
    watcher.on('add', (filePath: string) => {
      const rel = this.toRel(filePath);
      if (!rel) return;
      if (!this.ready) {
        // During initial scan: just track for reconciliation.
        this.discoveredPaths.add(rel);
      } else {
        // Post-ready: real new file.
        this.scheduleEvent(rel, 'create');
      }
    });

    watcher.on('change', (filePath: string) => {
      const rel = this.toRel(filePath);
      if (!rel) return;
      this.scheduleEvent(rel, 'modify');
    });

    watcher.on('unlink', (filePath: string) => {
      const rel = this.toRel(filePath);
      if (!rel) return;
      this.scheduleEvent(rel, 'delete');
    });

    watcher.on('ready', () => {
      this.ready = true;
      this.reconcile(existingPaths);
    });
  }

  /**
   * Compare files discovered during initial scan against the indexed set.
   * Files on disk but absent from the index get synthetic `create` events.
   * Processes in batches of 100 via `setImmediate` to avoid blocking the event
   * loop on large directories.
   */
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
      for (const rel of slice) {
        this.scheduleEvent(rel, 'create');
      }
      if (offset < toCreate.length) {
        setImmediate(flush);
      } else {
        this.emit('reconciled');
      }
    };

    setImmediate(flush);
  }

  /**
   * Schedule (or reschedule) a debounced event for `relPath`.
   * `delete` always wins over `modify`; `create` wins over `modify`.
   */
  private scheduleEvent(relPath: string, type: WatchEventType): void {
    // Merge event types: delete > create > modify
    const current = this.pendingEventTypes.get(relPath);
    if (current !== 'delete' && (type === 'delete' || current === undefined || type === 'create')) {
      this.pendingEventTypes.set(relPath, type);
    }
    this._lastEventAt = new Date().toISOString();

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
    // Reject paths outside root or dotfiles.
    if (rel.startsWith('..') || rel.startsWith('.')) return null;
    return rel;
  }
}
