import type { IngestJobData, IngestJobResult } from '../../contract/queue/index.js';

/**
 * Cancellation contract. Handlers MUST check `await ctx.isCancelled()`
 * between pipeline stages and short-circuit with `{ ok: false, errorCode:
 * 'Cancelled', ... }` when it returns `true`.
 *
 * Cancellation is cooperative — mid-stage cancellation requires killing
 * the process (BullMQ stalled retry).
 */
export interface HandlerContext {
  isCancelled: () => boolean | Promise<boolean>;
}

/**
 * Per-kind handler signature. PRDs 127–132 each export one of these.
 * v1 ships stubs that return a NotImplemented failure so the dispatch
 * round-trip can be exercised end-to-end before the real pipelines land.
 */
export type IngestHandler<K extends IngestJobData['kind']> = (
  data: Extract<IngestJobData, { kind: K }>,
  ctx: HandlerContext
) => Promise<IngestJobResult>;
