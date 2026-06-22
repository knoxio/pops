import {
  pillar as serverPillar,
  PillarCallError,
  type CallResult,
  type PillarHandle,
} from '@pops/pillar-sdk/server';

/**
 * Cross-pillar URI reconciliation worker (PRD-251 US-01 + US-02).
 *
 * Nightly job that walks the distinct `purchase_transaction_uri` and
 * `owner_uri` values on `home_inventory` and asks the owning pillar — via
 * the typed `pillar()` proxy from `@pops/pillar-sdk/server` — whether each
 * reference still resolves. Reconciliation outcomes:
 *
 *   - `ok`            → clear the corresponding `*_stale_at` column on
 *                       rows whose URI matches
 *   - `not-found`     → stamp `*_stale_at = now`. The row stays — existence
 *                       is best-effort per PRD-251 §"Business Rules"
 *   - `unavailable`   → log + leave the row alone; retry next tick
 *   - `bad-request`   → log "bad URI" for ops + leave the row alone
 *
 * The recursive-`setTimeout` scheduling mirrors
 * `apps/pops-ha-bridge-api/src/retention-worker.ts`: the next tick is only
 * armed after the current one settles, so a slow reconciliation cannot
 * pile up overlapping runs.
 */
import { crossPillarUrisService, type InventoryDb } from '../../db/index.js';
import { reconcileUriBatch, type ReconcileLogger } from './reconcile-cross-pillar-runner.js';

/**
 * Opaque cross-pillar router types for the proxies. `@pops/finance` and
 * `@pops/registry` both speak REST now, so there is no concrete router type to
 * import — the proxies are fully opaque (`unknown`); `PillarHandle<unknown>`
 * resolves to a handle with no procedure keys.
 */
export type FinanceRouter = unknown;
export type RegistryRouter = unknown;

const DAY_MS = 24 * 60 * 60 * 1000;

export type { ReconcileLogger };

export interface ReconcileProxies {
  finance?: PillarHandle<FinanceRouter>;
  registry?: PillarHandle<RegistryRouter>;
}

export interface ReconcileWorkerOptions {
  db: InventoryDb;
  intervalMs?: number;
  logger?: ReconcileLogger;
  now?: () => number;
  proxies?: ReconcileProxies;
}

export interface ReconcileWorkerHandle {
  stop: () => void;
}

export interface ReconcileCounters {
  ok: number;
  notFound: number;
  unavailable: number;
  badUri: number;
}

interface ParsedUri {
  pillar: string;
  type: string;
  id: string;
}

/**
 * Parse `pops://<pillar>/<type>/<id>`. Returns `null` for any shape that
 * isn't a well-formed soft reference — the caller treats those as bad URIs
 * (ops-visible warning, row preserved).
 */
export function parseSoftUri(uri: string): ParsedUri | null {
  const match = /^pops:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) return null;
  const [, pillar, type, id] = match;
  if (!pillar || !type || !id) return null;
  return { pillar, type, id };
}

function isCallResult(value: unknown): value is CallResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string'
  );
}

type ReconcileOutcome = 'ok' | 'not-found' | 'unavailable' | 'bad-request';

function classifyResult(value: unknown): ReconcileOutcome {
  if (isCallResult(value)) {
    if (value.kind === 'ok') return 'ok';
    if (value.kind === 'not-found') return 'not-found';
    if (value.kind === 'bad-request') return 'bad-request';
    return 'unavailable';
  }
  return 'ok';
}

function classifyError(err: unknown): ReconcileOutcome {
  if (err instanceof PillarCallError) {
    if (err.result.kind === 'not-found') return 'not-found';
    if (err.result.kind === 'bad-request') return 'bad-request';
    return 'unavailable';
  }
  return 'unavailable';
}

async function safeCall<T>(fn: () => Promise<CallResult<T>>): Promise<ReconcileOutcome> {
  try {
    return classifyResult(await fn());
  } catch (err) {
    return classifyError(err);
  }
}

export async function runReconciliation(options: {
  db: InventoryDb;
  now?: () => number;
  logger?: ReconcileLogger;
  proxies?: ReconcileProxies;
}): Promise<ReconcileCounters> {
  const now = options.now ?? Date.now;
  const stampIso = new Date(now()).toISOString();
  const counters: ReconcileCounters = { ok: 0, notFound: 0, unavailable: 0, badUri: 0 };
  const finance = options.proxies?.finance ?? serverPillar<FinanceRouter>('finance');
  const registry = options.proxies?.registry ?? serverPillar<RegistryRouter>('registry');
  const db = options.db;

  await reconcileUriBatch({
    db,
    logger: options.logger,
    counters,
    uris: crossPillarUrisService.listDistinctPurchaseTransactionUris(db),
    expectedPillar: 'finance',
    expectedType: 'transaction',
    parse: parseSoftUri,
    probe: (parsed, _uri) =>
      safeCall(() => finance.callDynamic('transactions', 'get', { id: parsed.id }, 'query')),
    onOk: (uri) => crossPillarUrisService.clearPurchaseTransactionUriStale(db, uri),
    onNotFound: (uri) => crossPillarUrisService.markPurchaseTransactionUriStale(db, uri, stampIso),
  });

  await reconcileUriBatch({
    db,
    logger: options.logger,
    counters,
    uris: crossPillarUrisService.listDistinctOwnerUris(db),
    // The owner URI namespace stays `pops://core/user/...` (PRD-251 H7 wire
    // contract) even though the pillar directory/id renamed to `registry`. The
    // registry pillar's `/users` handler still resolves `pops://core/...` URIs,
    // and the rows persisted on disk carry the `core` namespace — so the URI
    // shape match MUST keep `expectedPillar: 'core'`, NOT `registry`.
    expectedPillar: 'core',
    expectedType: 'user',
    parse: parseSoftUri,
    probe: (_parsed, uri) => safeCall(() => registry.callDynamic('users', 'get', { uri }, 'query')),
    onOk: (uri) => crossPillarUrisService.clearOwnerUriStale(db, uri),
    onNotFound: (uri) => crossPillarUrisService.markOwnerUriStale(db, uri, stampIso),
  });

  options.logger?.info?.('inventory cross-pillar reconciliation complete', { ...counters });
  return counters;
}

export function startCrossPillarReconciliationWorker(
  options: ReconcileWorkerOptions
): ReconcileWorkerHandle {
  const intervalMs = options.intervalMs ?? DAY_MS;
  const logger = options.logger;
  const now = options.now ?? Date.now;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const tick = async (): Promise<void> => {
    try {
      await runReconciliation({
        db: options.db,
        now,
        logger,
        proxies: options.proxies,
      });
    } catch (err) {
      logger?.warn?.('inventory cross-pillar reconciliation tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (!stopped) {
      timer = setTimeout(() => {
        void tick();
      }, intervalMs);
    }
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
