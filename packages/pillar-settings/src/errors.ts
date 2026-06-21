/**
 * Raised when a write/reset addresses a key the pillar never declared in
 * its settings manifest. Keys are a fixed declared set (no create verb), so
 * an undeclared write is a client error — the mounting pillar maps this to a
 * 400. Carries the offending keys for the response body.
 */
export class UnknownSettingKeyError extends Error {
  readonly keys: readonly string[];

  constructor(keys: readonly string[]) {
    super(`unknown setting key(s): ${keys.join(', ')}`);
    this.name = 'UnknownSettingKeyError';
    this.keys = keys;
  }
}
