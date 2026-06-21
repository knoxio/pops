import { z } from 'zod';

import { ManifestPayloadSchema } from '../manifest-schema/index.js';

const PillarRegistryEntrySchema = z
  .object({
    pillarId: z.string().min(1),
    baseUrl: z.string().min(1),
    manifest: ManifestPayloadSchema,
    lastSeenAt: z.string().min(1).optional(),
    lastHeartbeatAt: z.string().min(1).optional(),
    registered: z.boolean().optional(),
    status: z.enum(['healthy', 'unavailable', 'unknown']).optional(),
    capabilities: z.record(z.string(), z.boolean()).optional(),
  })
  .loose()
  .refine((entry) => Boolean(entry.lastSeenAt ?? entry.lastHeartbeatAt), {
    message: 'registry entry must include lastSeenAt or lastHeartbeatAt',
    path: ['lastSeenAt'],
  })
  .transform((entry) => {
    const resolved = entry.lastSeenAt ?? entry.lastHeartbeatAt ?? '';
    return { ...entry, lastSeenAt: resolved };
  });

const RegistrySnapshotPayloadSchema = z
  .object({
    pillars: z.array(PillarRegistryEntrySchema),
    fetchedAt: z.string().optional(),
  })
  .loose();

/**
 * Validates the JSON body returned by the registry discovery snapshot
 * (PRD-161). The SDK currently fetches `GET /core.registry.list` — the only
 * route core mounts today; the canonical `GET /registry/pillars` is introduced
 * in a later phase and is not live yet.
 *
 * Accepts both the bare payload shape and the tRPC-wrapped
 * `{ result: { data: ... } }` envelope so the fetcher can talk to either
 * a tRPC HTTP endpoint directly or a thin reverse-proxy that unwraps for us.
 */
export function parseRegistrySnapshotResponse(body: unknown): RegistrySnapshotPayload {
  const candidate = unwrapTrpcEnvelope(body);
  return RegistrySnapshotPayloadSchema.parse(candidate);
}

export type RegistrySnapshotPayload = z.infer<typeof RegistrySnapshotPayloadSchema>;
export type PillarRegistryEntryPayload = z.infer<typeof PillarRegistryEntrySchema>;

function unwrapTrpcEnvelope(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const result = body['result'];
  if (isRecord(result) && 'data' in result) return result['data'];
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
