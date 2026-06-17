/**
 * Nightly reconciliation worker for the finance pillar's cross-pillar
 * URI denormalisation (PRD-251 US-03).
 *
 * For every distinct `owner_uri` currently stored on `budgets`, the worker
 * asks core whether the URI still resolves (`core.users.get`). On a
 * "not-found" response the worker marks every budgets row referencing the
 * URI as stale (`owner_uri_stale_at = now`) without deleting anything —
 * existence is best-effort per the PRD. Transient errors (the core pillar
 * is unavailable, the call times out, the SDK reports `degraded`) are
 * logged and the row is left untouched until the next tick. Malformed
 * URIs (those that fail to parse against `pops://core/<type>/<id>`) are
 * logged for ops and the row is preserved as well.
 *
 * Scheduling mirrors `apps/pops-ha-bridge-api/src/retention-worker.ts`:
 * a recursive `setTimeout` so the next tick is only armed after the
 * current one resolves, and so the implementation is trivial to drive
 * with `vi.useFakeTimers()` in tests. The fan-out call inside a tick is
 * sequential rather than parallel — production has at most a few thousand
 * distinct owner URIs per pillar and the periodic-cron contract prefers
 * predictable load against the owning pillar over a thundering herd.
 *
 * The worker is constructor-injected via a `lookupOwnerUri` function so
 * tests don't have to spin up an HTTP transport — production wires the
 * pillar SDK proxy at boot time; tests wire a stub.
 */
import { crossPillarService, type FinanceDb } from '../../db/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReconcileLookupResult =
  | { kind: 'ok' }
  | { kind: 'not-found' }
  | { kind: 'bad-uri'; reason: string }
  | { kind: 'unavailable'; reason: string };

export type ReconcileLookupFn = (uri: string) => Promise<ReconcileLookupResult>;

export interface ReconcileWorkerLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface ReconcileWorkerOptions {
  db: FinanceDb;
  lookupOwnerUri: ReconcileLookupFn;
  intervalMs?: number;
  logger?: ReconcileWorkerLogger;
  now?: () => Date;
}

export interface ReconcileTickStats {
  resolved: number;
  staleMarked: number;
  badUri: number;
  unavailable: number;
}

export interface ReconcileWorkerHandle {
  stop: () => void;
  /**
   * Run a single reconciliation pass synchronously and return the per-pass
   * stats. Exposed for integration tests and for the boot script to fire
   * an immediate pass before arming the timer.
   */
  runOnce: () => Promise<ReconcileTickStats>;
}

function emptyStats(): ReconcileTickStats {
  return { resolved: 0, staleMarked: 0, badUri: 0, unavailable: 0 };
}

async function safeLookup(
  lookup: ReconcileLookupFn,
  uri: string,
  logger: ReconcileWorkerLogger | undefined
): Promise<ReconcileLookupResult> {
  try {
    return await lookup(uri);
  } catch (err) {
    logger?.warn?.('finance reconcile lookup threw', {
      uri,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'unavailable', reason: 'lookup-threw' };
  }
}

function applyOk(db: FinanceDb, uri: string, logger: ReconcileWorkerLogger | undefined): void {
  const cleared = crossPillarService.clearBudgetOwnerUriStale(db, uri);
  logger?.info?.('finance reconcile uri resolved', { uri, cleared });
}

function applyNotFound(
  db: FinanceDb,
  uri: string,
  now: Date,
  logger: ReconcileWorkerLogger | undefined
): void {
  const marked = crossPillarService.markBudgetOwnerUriStale(db, uri, now.toISOString());
  logger?.info?.('finance reconcile uri marked stale', { uri, marked });
}

interface ApplyResultContext {
  db: FinanceDb;
  uri: string;
  result: ReconcileLookupResult;
  now: Date;
  stats: ReconcileTickStats;
  logger: ReconcileWorkerLogger | undefined;
}

function applyResult(ctx: ApplyResultContext): void {
  const { db, uri, result, now, stats, logger } = ctx;
  if (result.kind === 'ok') {
    stats.resolved += 1;
    applyOk(db, uri, logger);
    return;
  }
  if (result.kind === 'not-found') {
    stats.staleMarked += 1;
    applyNotFound(db, uri, now, logger);
    return;
  }
  if (result.kind === 'bad-uri') {
    stats.badUri += 1;
    logger?.warn?.('finance reconcile bad uri (preserved for ops)', {
      uri,
      reason: result.reason,
    });
    return;
  }
  stats.unavailable += 1;
  if (result.reason === 'lookup-threw') return;
  logger?.warn?.('finance reconcile pillar unavailable', {
    uri,
    reason: result.reason,
  });
}

export function startReconcileCrossPillarWorker(
  options: ReconcileWorkerOptions
): ReconcileWorkerHandle {
  const intervalMs = options.intervalMs ?? DAY_MS;
  const now = options.now ?? ((): Date => new Date());
  const logger = options.logger;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function runOnce(): Promise<ReconcileTickStats> {
    const stats = emptyStats();
    const uris = crossPillarService.listDistinctBudgetOwnerUris(options.db);
    for (const uri of uris) {
      const result = await safeLookup(options.lookupOwnerUri, uri, logger);
      applyResult({ db: options.db, uri, result, now: now(), stats, logger });
    }
    logger?.info?.('finance reconcile tick complete', { ...stats, count: uris.length });
    return stats;
  }

  function arm(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, intervalMs);
  }

  async function tick(): Promise<void> {
    try {
      await runOnce();
    } catch (err) {
      logger?.warn?.('finance reconcile tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    arm();
  }

  void tick();

  return {
    stop: (): void => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
    runOnce,
  };
}
