import { z } from 'zod';

/**
 * Wire types for the registry handshake/discovery surface (PRD-161). The
 * registry pillar mounts each operation on BOTH the canonical slash form
 * `/registry/{register,heartbeat,deregister,pillars}` and the legacy dotted
 * `/core.registry.{register,heartbeat,deregister,list}` routes on the same
 * handlers (see `pillars/registry/src/api/app.ts`).
 *
 * The input/output zod schemas live here so the router stays focused on
 * the procedure plumbing and the tests can import the shapes directly.
 */
import { ManifestPayloadSchema } from '@pops/pillar-sdk';

export const PillarStatusSchema = z.enum(['healthy', 'unavailable', 'unknown']);

export type PillarStatusWire = z.infer<typeof PillarStatusSchema>;

/**
 * Live per-pillar capability statuses (`<capabilityKey> → up/down`),
 * epic 05 / S3. Self-reported on register + heartbeat; absent when the
 * pillar reports none (graceful degradation — an unreported capability
 * resolves to `unavailable`). Serializable: a plain boolean record.
 */
export const CapabilityStatusesSchema = z.record(z.string(), z.boolean());

export type CapabilityStatusesWire = z.infer<typeof CapabilityStatusesSchema>;

export const RegistryEntrySchema = z.object({
  pillarId: z.string(),
  baseUrl: z.string(),
  manifest: ManifestPayloadSchema,
  contract: z.object({
    package: z.string(),
    version: z.string(),
    tag: z.string(),
  }),
  registeredAt: z.string(),
  lastHeartbeatAt: z.string(),
  status: PillarStatusSchema,
  statusUpdatedAt: z.string(),
  capabilities: CapabilityStatusesSchema.optional(),
});

export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

export const ValidationIssueSchema = z.object({
  field: z.string(),
  reason: z.string(),
  got: z.unknown(),
  schemaPath: z.array(z.union([z.string(), z.number()])).readonly(),
});

export const RegisterInputSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  manifest: z.unknown(),
});

export const RegisterOutputSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    pillarId: z.string(),
    registeredAt: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    issues: z.array(ValidationIssueSchema),
  }),
]);

export const DeregisterInputSchema = z.object({
  pillar: z.string().min(1),
});

export const DeregisterOutputSchema = z.object({
  ok: z.literal(true),
  removed: z.boolean(),
});

/** @deprecated Use `DeregisterInputSchema`. Kept for one minor cycle. */
export const UnregisterInputSchema = DeregisterInputSchema;
/** @deprecated Use `DeregisterOutputSchema`. Kept for one minor cycle. */
export const UnregisterOutputSchema = DeregisterOutputSchema;

export const GetInputSchema = z.object({
  pillar: z.string().min(1),
});

export const ListOutputSchema = z.object({
  pillars: z.array(RegistryEntrySchema),
  fetchedAt: z.string(),
});

/**
 * Heartbeat wire shapes (Theme 13 PRD-162).
 *
 * Pillars POST the heartbeat route — currently `/core.registry.heartbeat` (the
 * canonical `/registry/heartbeat` lands in a later phase) — every
 * `HEARTBEAT_INTERVAL_MS` (≈10s) with their `pillarId`. The output is a
 * discriminated union:
 *   - `ok: true`  — the heartbeat was recorded; status now `healthy`.
 *   - `ok: false` — the pillar is not registered; SDK should re-register.
 */
export const HeartbeatInputSchema = z.object({
  pillar: z.string().min(1),
});

export const HeartbeatOutputSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    pillarId: z.string(),
    lastHeartbeatAt: z.string(),
    status: PillarStatusSchema,
    statusChanged: z.boolean(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.literal('not-registered'),
  }),
]);
