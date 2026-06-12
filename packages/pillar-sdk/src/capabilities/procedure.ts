import type { ProcedureShape } from './base-contract.js';
import type { CallResult } from './call-result.js';

/**
 * Procedure-level projections. `InputOf` picks `inputs[0]` (the first input
 * in tRPC's chainable `.input()` form) because the consumer-facing contract
 * exposes a single merged input shape — multi-input chaining is a tRPC
 * implementation detail the consumer never sees.
 *
 * `OutputOf` and `KindOf` are the obvious indexed projections; they exist as
 * named aliases so call sites read `OutputOf<Wishlist.list>` instead of
 * `Wishlist['list']['_def']['output']`.
 */

export type InputOf<P extends ProcedureShape> = P['_def']['inputs'] extends readonly [
  infer First,
  ...unknown[],
]
  ? First
  : never;

export type OutputOf<P extends ProcedureShape> = P['_def']['output'];

export type KindOf<P extends ProcedureShape> = P['_def']['kind'];

/**
 * The signature the SDK exposes for a procedure: input → `Promise<CallResult>`.
 * Consumer narrows on `result.kind === 'ok'`.
 */
export type CallSignature<P extends ProcedureShape> = (
  input: InputOf<P>
) => Promise<CallResult<OutputOf<P>>>;

/**
 * The throw-on-error variant attached to every callable as `.orThrow`.
 * Consumer code that wants happy-path ergonomics opts in by calling the
 * helper; failure modes become exceptions (`PillarCallError`).
 */
export type CallSignatureOrThrow<P extends ProcedureShape> = (
  input: InputOf<P>
) => Promise<OutputOf<P>>;
