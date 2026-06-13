/**
 * Thrown by `.orThrow()` when the underlying call did not resolve to
 * `{ kind: 'ok' }`. Carries the failure result for inspection.
 */
export class PillarCallError extends Error {
  override readonly name = 'PillarCallError';
  readonly pillarId: string;
  readonly result: CallFailure;

  constructor(pillarId: string, result: CallFailure) {
    super(`pillar('${pillarId}') call failed: ${result.kind}`);
    this.pillarId = pillarId;
    this.result = result;
  }
}

/**
 * Thrown for a hard runtime error caller code couldn't reasonably handle —
 * e.g. the SDK tried to read the discovery transport and it returned a
 * non-conforming shape. This is *not* used for `unavailable` / `degraded`
 * / `contract-mismatch`; those are returned as `CallResult` discriminants
 * so the caller can branch on them.
 */
export class PillarSdkError extends Error {
  override readonly name = 'PillarSdkError';
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export type CallSuccess<T> = { kind: 'ok'; value: T };

export type CallFailure =
  | { kind: 'unavailable'; pillar: string }
  | { kind: 'degraded'; pillar: string; reason: 'reconciling' }
  | {
      kind: 'contract-mismatch';
      pillar: string;
      expected?: string;
      actual?: string;
    }
  | { kind: 'not-found'; pillar: string; message?: string }
  | { kind: 'conflict'; pillar: string; message?: string }
  | { kind: 'bad-request'; pillar: string; message?: string };

export type CallResult<T> = CallSuccess<T> | CallFailure;

export function isOk<T>(result: CallResult<T>): result is CallSuccess<T> {
  return result.kind === 'ok';
}

/**
 * True when `err` is a `PillarCallError` whose failure result has the
 * `not-found` discriminant. Maps to HTTP 404 / tRPC `NOT_FOUND`.
 *
 * Replaces the older `err.result.kind === 'contract-mismatch'` check
 * which conflated "the addressed resource does not exist" with "the
 * pillar does not implement this procedure". `contract-mismatch` is now
 * reserved for genuine SDK ↔ pillar version skew.
 */
export function isNotFound(err: unknown): err is PillarCallError & {
  result: Extract<CallFailure, { kind: 'not-found' }>;
} {
  return err instanceof PillarCallError && err.result.kind === 'not-found';
}

/**
 * True when `err` is a `PillarCallError` whose failure result has the
 * `conflict` discriminant. Maps to HTTP 409 / tRPC `CONFLICT`.
 */
export function isConflict(err: unknown): err is PillarCallError & {
  result: Extract<CallFailure, { kind: 'conflict' }>;
} {
  return err instanceof PillarCallError && err.result.kind === 'conflict';
}

/**
 * True when `err` is a `PillarCallError` whose failure result has the
 * `bad-request` discriminant. Maps to HTTP 400 / tRPC `BAD_REQUEST`.
 */
export function isBadRequest(err: unknown): err is PillarCallError & {
  result: Extract<CallFailure, { kind: 'bad-request' }>;
} {
  return err instanceof PillarCallError && err.result.kind === 'bad-request';
}
