/**
 * `core.registry.*` tRPC router (Theme 13 PRD-161 + PRD-162).
 *
 * Wire surface for pillar registration + discovery on `pops-core-api`:
 *
 *   - `core.registry.register`   mutation  (internal-only, blocked at nginx)
 *   - `core.registry.deregister` mutation  (internal-only, blocked at nginx)
 *   - `core.registry.heartbeat`  mutation  (internal-only, blocked at nginx)
 *   - `core.registry.list`       query     (public — used by the shell + SDK)
 *   - `core.registry.get`        query     (public — single lookup)
 *
 * The mutating procedures validate the manifest payload against
 * PRD-157's `validateManifestPayload` from `@pops/pillar-sdk`. On
 * failure the procedure returns a structured `{ ok: false, issues }`
 * discriminated result rather than throwing; the SDK boot path crashes
 * loudly with the per-field report (PRD-158).
 *
 * Status reporting on `list`/`get` is computed live from
 * `lastHeartbeatAt` via `computeStatus` (PRD-162) so consumers see the
 * freshest possible state even if the background ticker is delayed.
 *
 * Authentication: mutating procedures use `publicProcedure` because the
 * trust boundary is the nginx dispatcher (which 403s these paths from
 * external traffic). Inside the docker network, pillars POST directly.
 * The subscription transport (PRD-163) is still out of scope here.
 */
import { pillarRegistryService } from '@pops/core-db';
import { validateManifestPayload } from '@pops/pillar-sdk';

import { publicProcedure, router } from '../../trpc.js';
import { emitRegistryEvent } from './event-bus.js';
import { computeStatus, registryNow } from './status.js';
import {
  DeregisterInputSchema,
  DeregisterOutputSchema,
  GetInputSchema,
  HeartbeatInputSchema,
  HeartbeatOutputSchema,
  ListOutputSchema,
  RegisterInputSchema,
  RegisterOutputSchema,
  RegistryEntrySchema,
  type RegistryEntry,
} from './types.js';

import type { PillarRegistration, PillarStatus } from '@pops/core-db';

function liveStatus(reg: PillarRegistration, now: Date): PillarStatus {
  if (reg.status === 'unknown') return 'unknown';
  return computeStatus(new Date(reg.lastHeartbeatAt), now);
}

function toRegistryEntry(reg: PillarRegistration, now: Date): RegistryEntry {
  const manifest = RegistryEntrySchema.shape.manifest.parse(reg.manifest);
  return {
    pillarId: reg.pillarId,
    baseUrl: reg.baseUrl,
    manifest,
    contract: {
      package: reg.contractPackage,
      version: reg.contractVersion,
      tag: reg.contractTag,
    },
    registeredAt: reg.registeredAt,
    lastHeartbeatAt: reg.lastHeartbeatAt,
    status: liveStatus(reg, now),
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
        now: registryNow().toISOString(),
      });
      const entry = toRegistryEntry(persisted, registryNow());
      emitRegistryEvent({ event: 'registered', pillarId: entry.pillarId, entry });
      return {
        ok: true as const,
        pillarId: persisted.pillarId,
        registeredAt: persisted.registeredAt,
      };
    }),

  deregister: publicProcedure
    .input(DeregisterInputSchema)
    .output(DeregisterOutputSchema)
    .mutation(({ input, ctx }) => {
      const removed = pillarRegistryService.deletePillarRegistration(ctx.coreDb, input.pillar);
      if (removed) {
        emitRegistryEvent({ event: 'deregistered', pillarId: input.pillar, entry: null });
      }
      return { ok: true as const, removed };
    }),

  heartbeat: publicProcedure
    .input(HeartbeatInputSchema)
    .output(HeartbeatOutputSchema)
    .mutation(({ input, ctx }) => {
      const result = pillarRegistryService.recordHeartbeat(ctx.coreDb, input.pillar, {
        now: registryNow().toISOString(),
      });
      if (!result.recorded || !result.registration) {
        return { ok: false as const, reason: 'not-registered' as const };
      }
      if (result.statusChanged) {
        const entry = toRegistryEntry(result.registration, registryNow());
        emitRegistryEvent({ event: 'health-changed', pillarId: entry.pillarId, entry });
      }
      return {
        ok: true as const,
        pillarId: result.registration.pillarId,
        lastHeartbeatAt: result.registration.lastHeartbeatAt,
        status: result.registration.status,
        statusChanged: result.statusChanged,
      };
    }),

  list: publicProcedure.output(ListOutputSchema).query(({ ctx }) => {
    const now = registryNow();
    const rows = pillarRegistryService.listPillarRegistrations(ctx.coreDb);
    return {
      pillars: rows.map((row) => toRegistryEntry(row, now)),
      fetchedAt: now.toISOString(),
    };
  }),

  get: publicProcedure
    .input(GetInputSchema)
    .output(RegistryEntrySchema.nullable())
    .query(({ input, ctx }) => {
      const row = pillarRegistryService.getPillarRegistration(ctx.coreDb, input.pillar);
      return row ? toRegistryEntry(row, registryNow()) : null;
    }),
});
