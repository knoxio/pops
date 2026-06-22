/**
 * Universal failure modes for cross-pillar calls. Every projected procedure
 * returns `Promise<CallResult<T>>`; consumers narrow on `kind === 'ok'` to
 * reach `.value`. The non-ok variants carry exactly the metadata a generic
 * caller needs to react: which pillar was unavailable, why a degraded path
 * was taken, what shape was expected vs. actual on contract mismatch, etc.
 *
 * Per-procedure custom failure modes are deliberately out of scope (PRD-160
 * "Out of Scope"); domain errors travel via `kind: 'degraded'` with a
 * `reason` string or via the contract's `errors` projection for consumers
 * that want to assert on the post-degrade payload.
 */
export type CallResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable'; readonly pillar: string }
  | { readonly kind: 'degraded'; readonly reason: string }
  | { readonly kind: 'contract-mismatch'; readonly expected: string; readonly actual: string }
  | {
      readonly kind: 'validation-error';
      readonly issues: readonly { readonly field: string; readonly reason: string }[];
    };

/**
 * The set of non-`ok` `CallResult` kinds. Used to type-narrow
 * `PillarCallError.cause` and to constrain callers that branch on failure
 * modes. `'ok'` is excluded because every consumer of this alias is in a
 * failure path.
 */
export type CallResultKind = Exclude<CallResult<unknown>, { kind: 'ok' }>['kind'];

/**
 * Thrown by the per-procedure `.orThrow()` helper attached to every callable
 * in `CallablePillar<C>`. Carries the original `CallResult` on `.cause` so a
 * `catch` block can recover the discriminant + metadata. The error never
 * carries an `ok` result — `.orThrow()` resolves with `value` on ok and
 * throws otherwise.
 */
export class PillarCallError extends Error {
  override readonly cause: Exclude<CallResult<unknown>, { kind: 'ok' }>;

  constructor(cause: Exclude<CallResult<unknown>, { kind: 'ok' }>) {
    super(formatPillarCallErrorMessage(cause), { cause });
    this.name = 'PillarCallError';
    this.cause = cause;
  }
}

function formatPillarCallErrorMessage(cause: Exclude<CallResult<unknown>, { kind: 'ok' }>): string {
  switch (cause.kind) {
    case 'not-found':
      return 'Pillar call failed: not-found';
    case 'unavailable':
      return `Pillar call failed: pillar '${cause.pillar}' unavailable`;
    case 'degraded':
      return `Pillar call failed: degraded (${cause.reason})`;
    case 'contract-mismatch':
      return `Pillar call failed: contract-mismatch (expected ${cause.expected}, actual ${cause.actual})`;
    case 'validation-error':
      return `Pillar call failed: validation-error (${cause.issues.length} issue${cause.issues.length === 1 ? '' : 's'})`;
  }
}
