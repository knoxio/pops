/**
 * Service account exposed by the registry pillar's admin surface.
 *
 * `keyPrefix` — and NOT `keyHash` — is the public-safe identifier that crosses
 * the wire. The full hash (`key_hash` in storage) and the raw plaintext key
 * must never leave the server.
 *
 * `scopes` is the set of pillar/permission scopes the key is allowed to call
 * (e.g. `'finance:read'`, `'core:admin'`).
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
