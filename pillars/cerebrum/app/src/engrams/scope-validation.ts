/**
 * Client-side scope validators mirroring the server-side scope rules.
 *
 * The authoritative validator is the cerebrum `POST /scopes/validate`
 * endpoint, but we duplicate the cheap structural rules here so the
 * edit form can give immediate feedback without a roundtrip per
 * keystroke.
 */

const SCOPE_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAX_SEGMENTS = 6;

/** Lowercase + trim a raw user-entered scope string. */
export function normaliseScope(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Returns true when `scope` matches the structural scope rules. */
export function isValidScope(scope: string): boolean {
  const normalised = normaliseScope(scope);
  if (normalised.length === 0) return false;
  if (normalised.startsWith('.') || normalised.endsWith('.')) return false;
  if (normalised.includes('..')) return false;
  const segments = normalised.split('.');
  if (segments.length > MAX_SEGMENTS) return false;
  return segments.every((seg) => SCOPE_SEGMENT_PATTERN.test(seg));
}

/** Returns the subset of scopes that fail validation. */
export function findInvalidScopes(scopes: string[]): string[] {
  return scopes.filter((s) => !isValidScope(s));
}
