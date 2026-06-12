import type { BaseContract } from './base-contract.js';
import type { CallSignature, CallSignatureOrThrow } from './procedure.js';

/**
 * Consumer-facing shape produced by `pillar('finance')` (PRD-191). Each
 * router on the contract becomes an object; each procedure on that router
 * becomes a callable that returns `Promise<CallResult<Output>>` with an
 * `.orThrow` helper attached for happy-path call sites.
 *
 * Per-procedure `.orThrow` (rather than a top-level `pillar.orThrow.foo.bar`)
 * is intentional: opt-in is explicit, and `.orThrow()` is visible at the
 * call site where the failure-mode behaviour matters.
 */
export type CallablePillar<C extends BaseContract> = {
  readonly [Router in keyof C['router']]: {
    readonly [Procedure in keyof C['router'][Router]]: CallSignature<
      C['router'][Router][Procedure]
    > & {
      readonly orThrow: CallSignatureOrThrow<C['router'][Router][Procedure]>;
    };
  };
};
