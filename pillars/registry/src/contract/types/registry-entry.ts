/**
 * Pilot entity for `@pops/core-contract`. This is a deliberate minimal
 * stub of the live `RegistryEntry` from `apps/pops-core-api`
 * (`src/modules/registry/types.ts`). The full shape includes a nested
 * `ManifestPayload` from `@pops/pillar-sdk` and discriminated heartbeat
 * unions — pulling those across the contract boundary would force a
 * runtime dependency on `@pops/pillar-sdk`, which violates the
 * "contract has no runtime dependencies on pillar packages" rule from
 * PRD-153.
 *
 * The minimal subset (pillarId/baseUrl/registeredAt) is sized to
 * exercise the round-trip tests + manifest + OpenAPI generators
 * without committing the contract to the full registry surface. The
 * production shape migrates in a follow-up PRD-153 US-07-style content
 * migration for core.
 *
 * `registeredAt` is an ISO-8601 timestamp validated by
 * `RegistryEntrySchema` via `.datetime()`.
 */
export interface RegistryEntry {
  pillarId: string;
  baseUrl: string;
  /** ISO-8601 timestamp. Validated by `RegistryEntrySchema` via `.datetime()`. */
  registeredAt: string;
}
