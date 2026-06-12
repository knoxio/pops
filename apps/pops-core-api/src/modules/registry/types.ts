import { z } from 'zod';

/**
 * Wire types for the `core.registry.*` tRPC surface (PRD-161).
 *
 * The input/output zod schemas live here so the router stays focused on
 * the procedure plumbing and the tests can import the shapes directly.
 */
import { ManifestPayloadSchema } from '@pops/pillar-sdk';

export const PillarStatusSchema = z.enum(['healthy', 'unavailable', 'unknown']);

export type PillarStatusWire = z.infer<typeof PillarStatusSchema>;

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
