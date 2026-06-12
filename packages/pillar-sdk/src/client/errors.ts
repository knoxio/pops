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
    };

export type CallResult<T> = CallSuccess<T> | CallFailure;

export function isOk<T>(result: CallResult<T>): result is CallSuccess<T> {
  return result.kind === 'ok';
}
