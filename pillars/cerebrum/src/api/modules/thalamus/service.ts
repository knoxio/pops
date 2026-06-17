/**
 * IndexService — request-scoped orchestration for the `cerebrum.index.*` procs.
 *
 * Stateless and DB-bound (docker-net trust, no per-request auth). Owns the four
 * index operations:
 *
 *  - `status`     — watcher health (reads the opt-in watcher singleton) +
 *                   embeddings-queue pending count (`null` when no Redis).
 *  - `reindex`    — full fs→index rebuild via the engrams `reindex` handler;
 *                   `force` additionally re-enqueues embeddings for every
 *                   indexed engram (soft-skipped when the queue is null).
 *  - `reindexSources` — cross-source scan over peer pillars, enqueueing changed
 *                   rows (`enqueued: 0` for an absent peer or null queue).
 *  - `reconcile`  — diff disk vs. index, surfacing `missing` / `orphaned`;
 *                   applied unless `dryRun`.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { type CerebrumDb, engramIndex } from '../../../db/index.js';
import { CROSS_SOURCE_TYPES, CrossSourceIndexer, type CrossSourceType } from './cross-source.js';
import { EmbeddingTrigger } from './embedding-trigger.js';
import { getThalamusWatcher } from './instance.js';
import { EMBEDDINGS_QUEUE_NAME, type EmbeddingsQueueAccessor } from './queue.js';
import { FrontmatterSyncService } from './sync.js';

import type { EngramService } from '../engrams/service.js';
import type { PeerClients } from '../retrieval/peer-clients.js';

export interface IndexServiceDeps {
  db: CerebrumDb;
  engramRoot: string;
  engramService: EngramService;
  peers: PeerClients;
  queueAccessor: EmbeddingsQueueAccessor;
}

export interface WatcherHealthWire {
  watching: boolean;
  lastEventAt: string | null;
  watchedPaths: number;
}

export interface IndexStatus {
  watcher: WatcherHealthWire;
  embeddingsQueue: { name: string; pendingCount: number | null };
}

export interface ReindexResult {
  indexed: number;
  enqueued: number;
}

export interface ReindexSourcesResult {
  enqueued: number;
  sourceTypes: CrossSourceType[];
}

export interface ReconcileResult {
  missing: string[];
  orphaned: string[];
  dryRun: boolean;
}

export class IndexService {
  constructor(private readonly deps: IndexServiceDeps) {}

  async status(): Promise<IndexStatus> {
    const watcherHealth = getThalamusWatcher()?.health() ?? {
      watching: false,
      lastEventAt: null,
      watchedPaths: 0,
    };

    let pendingCount: number | null = null;
    const queue = this.deps.queueAccessor();
    if (queue) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
        pendingCount =
          (counts['waiting'] ?? 0) + (counts['active'] ?? 0) + (counts['delayed'] ?? 0);
      } catch {
        pendingCount = null;
      }
    }

    return {
      watcher: watcherHealth,
      embeddingsQueue: { name: EMBEDDINGS_QUEUE_NAME, pendingCount },
    };
  }

  async reindex(force: boolean): Promise<ReindexResult> {
    const { indexed } = this.deps.engramService.reindex();
    if (!force) return { indexed, enqueued: 0 };

    const sync = new FrontmatterSyncService(this.deps.engramRoot, this.deps.db);
    const trigger = new EmbeddingTrigger(this.deps.queueAccessor);
    const rows = this.deps.db.select({ filePath: engramIndex.filePath }).from(engramIndex).all();
    const syncResults = rows.map((row) => sync.syncFile(row.filePath));
    const triggerResults = await trigger.trigger(syncResults, true);
    const enqueued = triggerResults.filter((r) => r.action === 'enqueued').length;
    return { indexed, enqueued };
  }

  async reindexSources(sourceTypes?: string[]): Promise<ReindexSourcesResult> {
    const validTypes = (sourceTypes ?? [...CROSS_SOURCE_TYPES]).filter((t): t is CrossSourceType =>
      (CROSS_SOURCE_TYPES as readonly string[]).includes(t)
    );
    const indexer = new CrossSourceIndexer({
      db: this.deps.db,
      peers: this.deps.peers,
      queueAccessor: this.deps.queueAccessor,
    });
    const { enqueued } = await indexer.scanAndEnqueue(validTypes);
    return { enqueued, sourceTypes: validTypes };
  }

  reconcile(dryRun: boolean): ReconcileResult {
    const root = this.deps.engramRoot;
    if (!existsSync(root)) return { missing: [], orphaned: [], dryRun };

    const diskPaths = collectDiskPaths(root);
    const indexedRows = this.deps.db
      .select({ filePath: engramIndex.filePath, status: engramIndex.status })
      .from(engramIndex)
      .all();
    const indexedPaths = new Map(indexedRows.map((r) => [r.filePath, r.status]));

    const missing = [...diskPaths].filter((p) => !indexedPaths.has(p));
    const orphaned = [...indexedPaths.entries()]
      .filter(([p, status]) => !diskPaths.has(p) && status !== 'orphaned')
      .map(([p]) => p);

    if (!dryRun && (missing.length > 0 || orphaned.length > 0)) {
      const sync = new FrontmatterSyncService(root, this.deps.db);
      for (const relPath of missing) sync.syncFile(relPath);
      for (const relPath of orphaned) sync.markOrphaned(relPath);
    }

    return { missing, orphaned, dryRun };
  }
}

function collectDiskPaths(root: string): Set<string> {
  const diskPaths = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        walk(join(dir, entry.name));
      } else if (entry.name.endsWith('.md')) {
        diskPaths.add(relative(root, join(dir, entry.name)).replaceAll('\\', '/'));
      }
    }
  };
  walk(root);
  return diskPaths;
}
