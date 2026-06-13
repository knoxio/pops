/**
 * Federated search partial-failure summary (PRD-199).
 *
 * Layered on top of {@link FederatedSearchResponse}'s per-target
 * `failures` list (PRD-197), the `partial` block surfaces a per-pillar
 * view that the UI can render as an "X of Y sources" indicator without
 * having to re-derive pillar membership from a flat list of
 * `{ pillarId, adapterName, reason }` records.
 *
 * The block is included on **every** response — even when every pillar
 * responded successfully — so consumers can rely on its presence without
 * a null check (per the PRD's "Every response includes `partial` block"
 * rule). When all adapters succeed, `failedPillars` and `timeoutPillars`
 * are empty arrays and `respondedPillars === requestedPillars`.
 */

import type { PillarAdapterTarget, FederatedSearchFailure } from './types.js';

export interface PartialFailureSummary {
  /** Pillar ids the orchestrator attempted to query, in fan-out order. */
  readonly requestedPillars: readonly string[];
  /**
   * Pillar ids that returned at least one adapter result without any
   * adapter failing. A pillar appears here only if *every* adapter it
   * advertised either resolved with results or resolved with an empty
   * array — any rejection (timeout or error) demotes the pillar to
   * `failedPillars` / `timeoutPillars`.
   */
  readonly respondedPillars: readonly string[];
  /**
   * Pillar ids that had at least one adapter reject with a non-timeout
   * error. Each entry carries the first error reason string the
   * orchestrator saw for that pillar so the UI can render a tooltip.
   */
  readonly failedPillars: readonly FailedPillarSummary[];
  /**
   * Pillar ids that had at least one adapter abort via the per-adapter
   * timeout (PRD-197 default 3s). Disjoint from `failedPillars` —
   * timeout wins when both classes are present for the same pillar.
   */
  readonly timeoutPillars: readonly string[];
}

export interface FailedPillarSummary {
  readonly pillar: string;
  readonly reason: string;
}

/**
 * Build the partial-failure summary from the orchestrator's fan-out
 * inputs (the target list) and outputs (the failure list).
 *
 * The function is intentionally pure so it can be reused outside the
 * runner — e.g. by a tRPC handler that wants to re-derive the summary
 * after dropping certain failures, or by a test asserting the
 * derivation in isolation.
 */
export function summarisePartialFailures(
  targets: readonly PillarAdapterTarget[],
  failures: readonly FederatedSearchFailure[]
): PartialFailureSummary {
  const requestedPillars = uniqueInOrder(targets.map((target) => target.pillarId));

  const timeoutSet = new Set<string>();
  const errorReasonByPillar = new Map<string, string>();

  for (const failure of failures) {
    if (failure.reason === 'timeout') {
      timeoutSet.add(failure.pillarId);
      continue;
    }
    if (!errorReasonByPillar.has(failure.pillarId)) {
      errorReasonByPillar.set(failure.pillarId, describeError(failure.error));
    }
  }

  const timeoutPillars = requestedPillars.filter((pillarId) => timeoutSet.has(pillarId));
  const failedPillars: FailedPillarSummary[] = requestedPillars
    .filter((pillarId) => errorReasonByPillar.has(pillarId) && !timeoutSet.has(pillarId))
    .map((pillarId) => ({
      pillar: pillarId,
      reason: errorReasonByPillar.get(pillarId) ?? 'unknown error',
    }));

  const failedOrTimedOut = new Set<string>([
    ...timeoutPillars,
    ...failedPillars.map((entry) => entry.pillar),
  ]);
  const respondedPillars = requestedPillars.filter((pillarId) => !failedOrTimedOut.has(pillarId));

  return { requestedPillars, respondedPillars, failedPillars, timeoutPillars };
}

function uniqueInOrder(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  return 'unknown error';
}
