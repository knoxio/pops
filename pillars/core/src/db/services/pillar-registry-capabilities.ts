/**
 * Capability-status (de)serialization for the pillar registry (epic 05 / S3).
 *
 * Pillars report their live capability statuses (`<capabilityKey> → up/down`)
 * on register + heartbeat; the latest snapshot is persisted per pillar as a
 * JSON blob in `pillar_registry.capabilities_json`. These helpers convert
 * between the in-memory record and the stored blob. Split out of the registry
 * service to keep that file within its line budget.
 */

/**
 * Latest reported capability statuses for a pillar (`<capabilityKey> →
 * up/down`). Declared locally so the registry service stays free of a
 * `@pops/pillar-sdk` dependency; the handler validates the wire shape and
 * passes a plain record through.
 */
export type CapabilityStatuses = Readonly<Record<string, boolean>>;

/** Serialize a reported snapshot for storage; `undefined` ⇒ NULL column. */
export function serializeCapabilities(capabilities: CapabilityStatuses | undefined): string | null {
  return capabilities === undefined ? null : JSON.stringify(capabilities);
}

/**
 * Parse the stored capability-status blob back into a `<key> → boolean`
 * record. NULL / malformed / non-object entries degrade to `null` (treated as
 * "nothing reported") rather than throwing — a corrupt row must not break
 * discovery. Non-boolean values are dropped, not coerced.
 */
export function parseCapabilitiesBlob(raw: string | null): CapabilityStatuses | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}
