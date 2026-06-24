/**
 * Minimal registry entry on the contract boundary. The full shape carries a
 * nested `ManifestPayload` from `@pops/pillar-sdk` and discriminated heartbeat
 * unions; surfacing those here would force a runtime dependency on
 * `@pops/pillar-sdk`, which the contract must not take. Consumers needing the
 * denormalised fields use `Pillar` (`types/pillar.ts`) instead.
 */
export interface RegistryEntry {
  pillarId: string;
  baseUrl: string;
  /** ISO-8601 timestamp. Validated by `RegistryEntrySchema` via `.datetime()`. */
  registeredAt: string;
}
