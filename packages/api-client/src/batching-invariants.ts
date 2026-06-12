import { PILLARS, type KnownPillarId } from '@pops/pillar-sdk';

/**
 * Batching invariants enforced for the splitLink (PRD-187/PRD-188).
 *
 * The shell's tRPC client must never compose a batch whose operations
 * resolve to more than one pillar URL. nginx and the per-pillar API
 * processes rely on a simple prefix match — a batch URL that mixes
 * `finance.*` and `media.*` cannot be routed deterministically once
 * pillars run as separate upstreams. The same constraint applies to
 * the legacy `/trpc` catch-all: pillar paths and legacy paths must
 * never share a batch.
 *
 * See `docs/themes/13-pillar-finale/prds/188-batching-invariants/`.
 */

/** Identifies the catch-all target for non-pillar (legacy) procedures. */
export const LEGACY_BATCH_TARGET = 'legacy' as const;
export type LegacyBatchTarget = typeof LEGACY_BATCH_TARGET;

/** Where a single op routes: a known pillar, or the legacy catch-all. */
export type BatchTarget = KnownPillarId | LegacyBatchTarget;

const PILLAR_SET: ReadonlySet<string> = new Set(PILLARS);

function isKnownPillarId(value: string): value is KnownPillarId {
  return PILLAR_SET.has(value);
}

/**
 * Resolves the batch target for a tRPC procedure path. The first dot-
 * separated segment selects the target; unknown / missing namespaces
 * fall through to the legacy catch-all.
 */
export function batchTargetOfPath(path: string): BatchTarget {
  const namespace = path.split('.')[0];
  if (!namespace) return LEGACY_BATCH_TARGET;
  return isKnownPillarId(namespace) ? namespace : LEGACY_BATCH_TARGET;
}

/** Op shape consumed by the invariant check — minimal on purpose. */
export interface BatchableOp {
  readonly path: string;
}

export interface BatchInvariantViolation {
  readonly message: string;
  readonly offendingPaths: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<BatchTarget>;
}

/**
 * Thrown when a composed batch contains ops that resolve to more than
 * one batch target. The shape exposes the offending paths and resolved
 * targets so the caller can surface a useful dev-mode warning.
 */
export class CrossPillarBatchError extends Error implements BatchInvariantViolation {
  readonly offendingPaths: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<BatchTarget>;

  constructor(violation: BatchInvariantViolation) {
    super(violation.message);
    this.name = 'CrossPillarBatchError';
    this.offendingPaths = violation.offendingPaths;
    this.targets = violation.targets;
  }
}

function formatViolation(
  pathsByTarget: ReadonlyMap<BatchTarget, ReadonlyArray<string>>
): BatchInvariantViolation {
  const targets = Array.from(pathsByTarget.keys());
  const offendingPaths = targets.flatMap((target) => pathsByTarget.get(target) ?? []);
  const summary = targets
    .map((target) => `${target}=[${(pathsByTarget.get(target) ?? []).join(', ')}]`)
    .join(' | ');
  return {
    message:
      `Batch invariant violation (PRD-188): every op in a batch must resolve to the same ` +
      `pillar URL. Got ${targets.length} distinct targets — ${summary}. ` +
      `See docs/themes/13-pillar-finale/prds/188-batching-invariants/README.md.`,
    offendingPaths,
    targets,
  };
}

function groupByTarget(ops: ReadonlyArray<BatchableOp>): Map<BatchTarget, string[]> {
  const grouped = new Map<BatchTarget, string[]>();
  for (const op of ops) {
    const target = batchTargetOfPath(op.path);
    const bucket = grouped.get(target);
    if (bucket) bucket.push(op.path);
    else grouped.set(target, [op.path]);
  }
  return grouped;
}

/**
 * Asserts that every op in `ops` routes to the same batch target.
 * Throws {@link CrossPillarBatchError} when the invariant is violated.
 * Empty batches and single-op batches always pass.
 */
export function assertSingleTargetBatch(ops: ReadonlyArray<BatchableOp>): void {
  if (ops.length < 2) return;
  const grouped = groupByTarget(ops);
  if (grouped.size <= 1) return;
  throw new CrossPillarBatchError(formatViolation(grouped));
}

/**
 * Non-throwing variant: returns the resolved target on success, or a
 * {@link BatchInvariantViolation} describing the cross-target mix. Useful
 * for dev-mode logging where we don't want to crash the UI.
 */
export function checkSingleTargetBatch(
  ops: ReadonlyArray<BatchableOp>
): { ok: true; target: BatchTarget | null } | { ok: false; violation: BatchInvariantViolation } {
  if (ops.length === 0) return { ok: true, target: null };
  const grouped = groupByTarget(ops);
  if (grouped.size === 1) {
    const [target] = grouped.keys();
    return { ok: true, target: target ?? null };
  }
  return { ok: false, violation: formatViolation(grouped) };
}
