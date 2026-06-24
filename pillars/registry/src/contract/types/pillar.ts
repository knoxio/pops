export const PILLAR_STATUSES = ['healthy', 'unavailable', 'unknown'] as const;

export type PillarStatus = (typeof PILLAR_STATUSES)[number];

/**
 * A registered pillar process — the storage projection of one row in the
 * `pillar_registry` table (`pillars/registry/src/db/schema/pillar-registry.ts`)
 * minus the verbatim manifest blob.
 *
 * Lighter than `RegistryEntry`, which carries the full wire shape including
 * the nested `ManifestPayload` from `@pops/pillar-sdk`. The contract must not
 * take a runtime dependency on pillar packages, so consumers that only need
 * the denormalised fields code against `Pillar` instead.
 */
export interface Pillar {
  pillarId: string;
  baseUrl: string;
  contractPackage: string;
  contractVersion: string;
  contractTag: string;
  status: PillarStatus;
  /** ISO-8601 timestamp. Validated by `PillarSchema` via `.datetime()`. */
  registeredAt: string;
  /** ISO-8601 timestamp. Validated by `PillarSchema` via `.datetime()`. */
  lastHeartbeatAt: string;
  /** ISO-8601 timestamp. Validated by `PillarSchema` via `.datetime()`. */
  statusUpdatedAt: string;
}
