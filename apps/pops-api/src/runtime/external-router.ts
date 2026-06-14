/**
 * Passthrough tRPC router for one external (PRD-228) pillar.
 *
 * The orchestrator does not introspect the external pillar's procedure
 * shape at the type level. Per PRD-242 US-02, external pillars surface a
 * single `callDynamic` procedure that takes a runtime `{ procedure, input,
 * kind }` payload and forwards it to the registered `baseUrl`. This mirrors
 * the consumer-side `pillar(id).callDynamic` proxy shipped in PRD-242 PR
 * #3131, so the consumer's type system stays static even for runtime-
 * registered pillars.
 *
 * Forwarding itself is injectable (`forward` arg) so US-04 can plug in the
 * real HTTP transport while US-02 unit tests inject an in-memory stub.
 */
import { z } from 'zod';

import { protectedProcedure, router } from '../trpc.js';

import type { ExternalPillarEntry } from './externals-registry.js';

export type ExternalForwarder = (
  entry: ExternalPillarEntry,
  payload: {
    readonly procedure: string;
    readonly input: unknown;
    readonly kind: 'query' | 'mutation';
  }
) => Promise<unknown>;

const callDynamicInputSchema = z.object({
  procedure: z.string().min(1),
  input: z.unknown().optional(),
  kind: z.enum(['query', 'mutation']).default('query'),
});

export function buildExternalPillarRouter(
  entry: ExternalPillarEntry,
  forward: ExternalForwarder
): ReturnType<typeof router> {
  const callDynamic = protectedProcedure
    .input(callDynamicInputSchema)
    .mutation(async ({ input }) => {
      return forward(entry, {
        procedure: input.procedure,
        input: input.input,
        kind: input.kind,
      });
    });

  return router({
    callDynamic,
  });
}

/**
 * Default forwarder: returns a `NOT_IMPLEMENTED`-shaped error result.
 *
 * US-02 stops at registering the external pillar surface; the actual HTTP
 * forwarding ships in US-04. Until then a `callDynamic` call against an
 * external pillar resolves with an explicit deferred-marker so production
 * code can detect the unimplemented path.
 */
export const deferredExternalForwarder: ExternalForwarder = async (entry, payload) =>
  Promise.resolve({
    ok: false as const,
    reason: 'external-forwarding-deferred' as const,
    pillarId: entry.pillarId,
    procedure: payload.procedure,
  });
