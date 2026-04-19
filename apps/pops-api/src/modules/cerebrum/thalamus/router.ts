/**
 * cerebrum.index tRPC router — exposes watcher health, on-demand reindex,
 * cross-source re-embedding, and reconciliation dry-runs.
 */
import { z } from 'zod';

import { getDrizzle } from '../../../db.js';
import { EMBEDDINGS_QUEUE, getEmbeddingsQueue } from '../../../jobs/queues.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getEngramRoot } from '../instance.js';
import { getEngramService } from '../instance.js';
import { CROSS_SOURCE_TYPES, CrossSourceIndexer } from './cross-source.js';
import { getFileWatcher } from './instance.js';

export const indexRouter = router({
  /**
   * Returns watcher health and embeddings queue pending count.
   */
  status: protectedProcedure.query(async () => {
    const watcher = getFileWatcher();
    const health = watcher?.health() ?? { watching: false, lastEventAt: null, watchedPaths: 0 };

    let pendingCount: number | null = null;
    try {
      const queue = getEmbeddingsQueue();
      pendingCount = await queue
        .getJobCounts('waiting', 'active', 'delayed')
        .then((counts) => (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0));
    } catch {
      // Queue unavailable — leave null.
    }

    return {
      watcher: health,
      embeddingsQueue: {
        name: EMBEDDINGS_QUEUE,
        pendingCount,
      },
    };
  }),

  /**
   * Re-index all engram files from disk.  Optionally forces re-embedding of
   * every engram regardless of hash changes.
   */
  reindex: protectedProcedure
    .input(z.object({ force: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const service = getEngramService();
      const result = service.reindex();

      if (input.force) {
        // If forced, enqueue embeddings for all engrams in the index.
        const { FrontmatterSyncService } = await import('./sync.js');
        const { EmbeddingTrigger } = await import('./embedding-trigger.js');
        const db = getDrizzle();
        const root = getEngramRoot();
        const syncService = new FrontmatterSyncService(root, db);
        const trigger = new EmbeddingTrigger();

        // Get all .md files relative paths and sync + trigger each.
        const { engramIndex } = await import('@pops/db-types');
        const rows = db.select({ filePath: engramIndex.filePath }).from(engramIndex).all();
        const syncResults = rows.map((row) => syncService.syncFile(row.filePath));
        await trigger.trigger(syncResults, true);
      }

      return result;
    }),

  /**
   * Enqueue cross-source embedding jobs for the given source types.
   */
  reindexSources: protectedProcedure
    .input(z.object({ sourceTypes: z.array(z.string()).optional() }))
    .mutation(async ({ input }) => {
      const db = getDrizzle();
      const indexer = new CrossSourceIndexer(db);

      const validTypes = (input.sourceTypes ?? [...CROSS_SOURCE_TYPES]).filter(
        (t): t is (typeof CROSS_SOURCE_TYPES)[number] =>
          (CROSS_SOURCE_TYPES as readonly string[]).includes(t)
      );

      const result = await indexer.scanAndEnqueue(validTypes);
      return { enqueued: result.enqueued, sourceTypes: validTypes };
    }),

  /**
   * Reconcile disk state against the index.  In dry-run mode returns the list
   * of discrepancies without making changes.
   */
  reconcile: protectedProcedure
    .input(z.object({ dryRun: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const { existsSync, readdirSync } = await import('node:fs');
      const { join, relative } = await import('node:path');
      const { engramIndex } = await import('@pops/db-types');

      const root = getEngramRoot();
      const db = getDrizzle();

      if (!existsSync(root)) {
        return { missing: [], orphaned: [], dryRun: input.dryRun ?? false };
      }

      // Collect all .md files on disk.
      const diskPaths = new Set<string>();
      const walk = (dir: string): void => {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.')) continue;
            walk(join(dir, entry.name));
          } else if (entry.name.endsWith('.md')) {
            const rel = relative(root, join(dir, entry.name)).replaceAll('\\', '/');
            diskPaths.add(rel);
          }
        }
      };
      walk(root);

      // Collect indexed paths.
      const indexedRows = db
        .select({ filePath: engramIndex.filePath, status: engramIndex.status })
        .from(engramIndex)
        .all();
      const indexedPaths = new Map(indexedRows.map((r) => [r.filePath, r.status]));

      // Files on disk but not indexed.
      const missing = [...diskPaths].filter((p) => !indexedPaths.has(p));
      // Indexed paths not on disk (and not already orphaned).
      const orphaned = [...indexedPaths.entries()]
        .filter(([p, status]) => !diskPaths.has(p) && status !== 'orphaned')
        .map(([p]) => p);

      if (!input.dryRun) {
        const { FrontmatterSyncService } = await import('./sync.js');
        const syncService = new FrontmatterSyncService(root, db);

        for (const relPath of missing) {
          syncService.syncFile(relPath);
        }
        for (const relPath of orphaned) {
          syncService.markOrphaned(relPath);
        }
      }

      return { missing, orphaned, dryRun: input.dryRun ?? false };
    }),
});
