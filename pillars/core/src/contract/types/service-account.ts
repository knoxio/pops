/**
 * Service account exposed by the core pillar admin surface.
 *
 * Mirrors `apps/pops-core-api/src/modules/service-accounts/types.ts`
 * (`ServiceAccountSchema`) and the live `service_accounts` table
 * (migration `0054_service_accounts`).
 *
 * `keyPrefix` — and NOT `keyHash` — is the public-safe identifier that
 * crosses the wire. The full hash (`key_hash` in storage) and the raw
 * plaintext key never leave the server; the brief's suggestion to expose
 * `keyHash` would leak material that should stay server-side.
 *
 * `revokedAt` reflects the storage column (PRD-153 calls it `disabledAt`
 * but the live shape uses `revokedAt`). The contract follows the live
 * wire field name rather than the brief.
 *
 * `scopes` is the set of pillar/permission scopes the key is allowed to
 * call (e.g. `'finance:read'`, `'core:admin'`).
 */
export interface ServiceAccount {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: readonly string[];
  /** ISO-8601 timestamp. Validated by `ServiceAccountSchema` via `.datetime()`. */
  createdAt: string;
  /** ISO-8601 timestamp, or `null` if the key has never been used. */
  lastUsedAt: string | null;
  /** ISO-8601 timestamp, or `null` if the key is still active. */
  revokedAt: string | null;
  /** Email/identifier of the user who minted this key, or `null` for system-created. */
  createdBy: string | null;
}
