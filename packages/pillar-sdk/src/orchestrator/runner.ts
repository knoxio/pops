/**
 * Federated query orchestrator (PRD-197).
 *
 * Reads the discovery registry, fans the query out to every pillar
 * advertising a search adapter in `manifest.search.adapters` (PRD-196),
 * waits with a per-target timeout, then merges the per-pillar
 * `ScoredResult[]` via {@link mergeResults} (PRD-198).
 *
 * Pure orchestration: no global state, no I/O of its own. Discovery is
 * passed in as an array (test) or as a fetcher returning the snapshot
 * (production — typically `() => pillarRegistry().then(s => s.pillars)`).
 * Adapter dispatch is delegated to a {@link SearchAdapterInvoker} so the
 * orchestrator does not need to know how the underlying procedure is
 * transported.
 *
 * See {@link FederatedSearchQuery} for the interim-shape limitation note
 * (the manifest currently exposes only adapter names; PRD-196 will add
 * `procedurePath` + `queryShape` so the orchestrator can pre-filter).
 */

import { mergeResults } from '../ranking/merge.js';

import type { PillarSnapshot } from '../discovery/types.js';
import type { MergedResult, PillarWeights, ScoredResult } from '../ranking/types.js';
import type {
  FederatedSearchFailure,
  FederatedSearchQuery,
  PillarAdapterTarget,
  SearchAdapterInvoker,
} from './types.js';

/** Default per-adapter timeout — matches PRD-197 "Per-adapter timeout 3s". */
export const DEFAULT_ADAPTER_TIMEOUT_MS = 3_000;

export interface FederatedSearchOptions {
  readonly query: FederatedSearchQuery;
  readonly invoker: SearchAdapterInvoker;
  /**
   * Discovery source. Either an array (test fixtures) or a fetcher
   * function returning the registered pillar snapshots — typically
   * `() => pillarRegistry().then(s => s.pillars)`.
   */
  readonly discovery: readonly PillarSnapshot[] | (() => Promise<readonly PillarSnapshot[]>);
  /** Per-adapter timeout. Defaults to {@link DEFAULT_ADAPTER_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** Per-pillar ranking weights forwarded to {@link mergeResults}. */
  readonly weights?: PillarWeights;
  /**
   * Sink for orchestration warnings — e.g. an adapter returned a
   * non-array result. Defaults to a no-op so the runner stays a pure
   * function with no console I/O.
   */
  readonly onWarn?: (message: string) => void;
  /**
   * Clock injection point for deterministic timeout tests. Defaults to
   * the global `setTimeout` / `clearTimeout`.
   */
  readonly setTimeoutImpl?: typeof setTimeout;
  readonly clearTimeoutImpl?: typeof clearTimeout;
}

export interface FederatedSearchResponse {
  readonly results: readonly MergedResult[];
  readonly failures: readonly FederatedSearchFailure[];
}

export class EmptyFederatedQueryError extends Error {
  override readonly name = 'EmptyFederatedQueryError';
  constructor() {
    super('Federated search requires at least one of text, tags, or dateRange.');
  }
}

/**
 * Run a federated search across every pillar advertising a search
 * adapter. Resolves with the merged ranked results and a per-target
 * failure list (timeout or thrown error). Never rejects on adapter
 * failure — that is what {@link FederatedSearchResponse.failures} is
 * for. Only rejects if the input query is structurally empty (PRD-197
 * "empty queries are rejected"); see {@link EmptyFederatedQueryError}.
 */
export async function runFederatedSearch(
  options: FederatedSearchOptions
): Promise<FederatedSearchResponse> {
  if (!hasAnyQueryDimension(options.query)) throw new EmptyFederatedQueryError();

  const {
    invoker,
    query,
    timeoutMs = DEFAULT_ADAPTER_TIMEOUT_MS,
    weights,
    onWarn = noopWarn,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
  } = options;

  const pillars = await resolveDiscovery(options.discovery);
  const targets = collectTargets(pillars, query.pillars);

  const settled = await Promise.allSettled(
    targets.map((target) =>
      invokeWithTimeout({
        target,
        query,
        invoker,
        timeoutMs,
        setTimeoutImpl,
        clearTimeoutImpl,
      })
    )
  );

  const { perPillarResults, failures } = collectOutcomes(targets, settled, onWarn);

  const merged = mergeResults(perPillarResults, {
    limit: query.limit,
    weights,
    onWarn,
  });

  return { results: merged, failures };
}

interface CollectedOutcomes {
  readonly perPillarResults: Map<string, ScoredResult[]>;
  readonly failures: FederatedSearchFailure[];
}

function collectOutcomes(
  targets: readonly PillarAdapterTarget[],
  settled: readonly PromiseSettledResult<readonly ScoredResult[]>[],
  onWarn: (message: string) => void
): CollectedOutcomes {
  const perPillarResults = new Map<string, ScoredResult[]>();
  for (const target of targets) {
    if (!perPillarResults.has(target.pillarId)) {
      perPillarResults.set(target.pillarId, []);
    }
  }

  const failures: FederatedSearchFailure[] = [];

  for (const [index, target] of targets.entries()) {
    const outcome = settled[index];
    if (outcome === undefined) continue;

    if (outcome.status === 'rejected') {
      failures.push(classifyRejection(target, outcome.reason));
      continue;
    }

    const adapterResults = outcome.value;
    if (!Array.isArray(adapterResults)) {
      onWarn(
        `[orchestrator] Adapter ${target.pillarId}/${target.adapterName} returned a non-array result; ignored.`
      );
      continue;
    }

    perPillarResults.get(target.pillarId)?.push(...adapterResults);
  }

  return { perPillarResults, failures };
}

function hasAnyQueryDimension(query: FederatedSearchQuery): boolean {
  if (query.text !== undefined && query.text.trim().length > 0) return true;
  if (query.tags !== undefined && query.tags.length > 0) return true;
  if (query.dateRange !== undefined) return true;
  return false;
}

async function resolveDiscovery(
  source: FederatedSearchOptions['discovery']
): Promise<readonly PillarSnapshot[]> {
  if (typeof source === 'function') return source();
  return source;
}

function collectTargets(
  pillars: readonly PillarSnapshot[],
  allowList: readonly string[] | undefined
): readonly PillarAdapterTarget[] {
  const allowed = allowList && allowList.length > 0 ? new Set(allowList) : undefined;
  const targets: PillarAdapterTarget[] = [];

  for (const pillar of pillars) {
    if (!pillar.registered) continue;
    if (allowed !== undefined && !allowed.has(pillar.pillarId)) continue;

    for (const adapterName of pillar.manifest.search.adapters) {
      targets.push({ pillarId: pillar.pillarId, adapterName });
    }
  }

  return targets;
}

interface InvokeWithTimeoutArgs {
  readonly target: PillarAdapterTarget;
  readonly query: FederatedSearchQuery;
  readonly invoker: SearchAdapterInvoker;
  readonly timeoutMs: number;
  readonly setTimeoutImpl: typeof setTimeout;
  readonly clearTimeoutImpl: typeof clearTimeout;
}

class AdapterTimeoutError extends Error {
  override readonly name = 'AdapterTimeoutError';
}

async function invokeWithTimeout(args: InvokeWithTimeoutArgs): Promise<readonly ScoredResult[]> {
  const { target, query, invoker, timeoutMs, setTimeoutImpl, clearTimeoutImpl } = args;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeoutImpl(() => {
      reject(new AdapterTimeoutError());
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([invoker(target, query, controller.signal), timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeoutImpl(timer);
    if (!controller.signal.aborted) controller.abort();
  }
}

function classifyRejection(target: PillarAdapterTarget, reason: unknown): FederatedSearchFailure {
  if (reason instanceof AdapterTimeoutError) {
    return { pillarId: target.pillarId, adapterName: target.adapterName, reason: 'timeout' };
  }
  return {
    pillarId: target.pillarId,
    adapterName: target.adapterName,
    reason: 'error',
    error: reason,
  };
}

function noopWarn(_message: string): void {
  /* default sink — see `FederatedSearchOptions.onWarn`. */
}
