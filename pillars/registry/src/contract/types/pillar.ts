export const PILLAR_STATUSES = ['healthy', 'unavailable', 'unknown'] as const;

export type PillarStatus = (typeof PILLAR_STATUSES)[number];

/**
 * A registered pillar process — the storage-projection of one row in the
 * `pillar_registry` table (`packages/db-types/src/schema/pillar-registry.ts`)
 * minus the verbatim manifest blob.
 *
 * Distinct from `RegistryEntry`: `RegistryEntry` is the full tRPC wire
 * shape (including the nested `ManifestPayload` from `@pops/pillar-sdk`,
 * which the contract deliberately does not depend on). `Pillar` is the
 * lighter denormalised projection downstream consumers can code against
 * without pulling the SDK manifest schema across the contract boundary.
 * The contract-rule "no runtime dependencies on pillar packages" applies
 * the same way as it did to the original `RegistryEntry` pilot — see
 * `types/registry-entry.ts`.
 *
 * Brief divergence: PRD-153's brief listed `manifestUrl` and
 * `registeredAt`+`lastHeartbeatAt`+`lastEditedTime`. The live storage
 * does not have `manifestUrl` (only `baseUrl`), and there is no
 * `lastEditedTime` column on `pillar_registry`. The wire `statusUpdatedAt`
 * is what reflects "last time anything about this pillar's status moved".
 * The contract pins the live storage projection, not the brief.
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
