/**
 * Key/value setting exposed by the registry pillar's `settings` surface.
 *
 * Intentionally minimal: the wire surfaces only `{ key, value }` because the
 * `settings` table (`pillars/registry/src/db/schema/settings.ts`) has no other
 * columns. The contract bumps in lockstep when the storage layer grows.
 */
export interface Setting {
  key: string;
  value: string;
}
