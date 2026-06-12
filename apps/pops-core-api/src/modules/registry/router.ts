/**
 * `core.registry.*` tRPC router (Theme 13 PRD-161).
 *
 * Wire surface for pillar registration + discovery on `pops-core-api`:
 *
 *   - `core.registry.register`   mutation  (internal-only, blocked at nginx)
 *   - `core.registry.unregister` mutation  (internal-only, blocked at nginx)
 *   - `core.registry.list`       query     (public — used by the shell + SDK)
 *   - `core.registry.get`        query     (public — single lookup)
 *
 * The mutating procedures validate the manifest payload against
 * PRD-157's `validateManifestPayload` from `@pops/pillar-sdk`. On
 * failure the procedure returns a structured `{ ok: false, issues }`
 * discriminated result rather than throwing; the SDK boot path crashes
 * loudly with the per-field report (PRD-158).
 *
 * Authentication: mutating procedures use `publicProcedure` because the
 * trust boundary is the nginx dispatcher (which 403s these paths from
 * external traffic). Inside the docker network, pillars POST directly.
 * Heartbeat (PRD-162) and subscription transport (PRD-163) are out of
 * scope for this PR.
 */
import { pillarRegistryService } from '@pops/core-db';
import { validateManifestPayload } from '@pops/pillar-sdk';

import { publicProcedure, router } from '../../trpc.js';
import {
  GetInputSchema,
  ListOutputSchema,
  RegisterInputSchema,
  RegisterOutputSchema,
  RegistryEntrySchema,
  UnregisterInputSchema,
  UnregisterOutputSchema,
  type RegistryEntry,
} from './types.js';

import type { PillarRegistration } from '@pops/core-db';

function toRegistryEntry(reg: PillarRegistration): RegistryEntry {
  return {
    pillarId: reg.pillarId,
    baseUrl: reg.baseUrl,
    manifest: reg.manifest,
    contract: {
      package: reg.contractPackage,
      version: reg.contractVersion,
      tag: reg.contractTag,
    },
    registeredAt: reg.registeredAt,
    lastHeartbeatAt: reg.lastHeartbeatAt,
    status: reg.status,
    statusUpdatedAt: reg.statusUpdatedAt,
  };
}

export const registryRouter = router({
  register: publicProcedure
    .input(RegisterInputSchema)
    .output(RegisterOutputSchema)
    .mutation(({ input, ctx }) => {
      const result = validateManifestPayload(input.manifest);
      if (!result.ok) {
        return { ok: false as const, issues: result.issues };
      }
      const persisted = pillarRegistryService.upsertPillarRegistration(ctx.coreDb, {
        baseUrl: input.baseUrl,
        manifest: result.payload,
      });
      return {
        ok: true as const,
        pillarId: persisted.pillarId,
        registeredAt: persisted.registeredAt,
      };
    }),

  unregister: publicProcedure
    .input(UnregisterInputSchema)
    .output(UnregisterOutputSchema)
    .mutation(({ input, ctx }) => {
      const removed = pillarRegistryService.deletePillarRegistration(ctx.coreDb, input.pillar);
      return { ok: true as const, removed };
    }),

  list: publicProcedure.output(ListOutputSchema).query(({ ctx }) => {
    const rows = pillarRegistryService.listPillarRegistrations(ctx.coreDb);
    return {
      pillars: rows.map(toRegistryEntry),
      fetchedAt: new Date().toISOString(),
    };
  }),

  get: publicProcedure
    .input(GetInputSchema)
    .output(RegistryEntrySchema.nullable())
    .query(({ input, ctx }) => {
      const row = pillarRegistryService.getPillarRegistration(ctx.coreDb, input.pillar);
      return row ? toRegistryEntry(row) : null;
    }),
});
