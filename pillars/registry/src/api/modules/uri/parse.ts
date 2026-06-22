/**
 * URI parsing for the ADR-012 universal object URI scheme:
 *
 *   pops:{moduleId}/{type}/{id}
 *
 * Relocated verbatim from `apps/pops-api/src/modules/core/uri/parse.ts`
 * (pure function, no monolith coupling).
 *
 * Rules per ADR-012:
 * - Lowercase only.
 * - `moduleId` matches the API module name (finance, media, inventory, core).
 * - `type` is singular, kebab-case (transaction, movie, tv-show).
 * - `id` is the primary key — opaque from the parser's perspective.
 *
 * Returns a discriminated parse result so the caller can short-circuit to a
 * `malformed` resolver result with a specific reason rather than throwing.
 */
export interface ParsedUri {
  moduleId: string;
  type: string;
  id: string;
}

export type ParseUriResult = { ok: true; parsed: ParsedUri } | { ok: false; reason: string };

const URI_PREFIX = 'pops:';

/** Lowercase ASCII letters, digits, hyphens — used for moduleId and type. */
const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Parse a `pops:{moduleId}/{type}/{id}` URI per ADR-012.
 *
 * The grammar is strict: the prefix must be exactly `pops:`, the path must
 * have exactly three non-empty segments, and `moduleId`/`type` must be
 * lowercase kebab-case. The `id` segment is opaque — any non-empty,
 * non-`/`, non-uppercase string is accepted.
 */
export function parseUri(uri: string): ParseUriResult {
  if (typeof uri !== 'string' || uri.length === 0) {
    return { ok: false, reason: 'URI must be a non-empty string' };
  }

  if (!uri.startsWith(URI_PREFIX)) {
    return { ok: false, reason: `URI must start with '${URI_PREFIX}'` };
  }

  const path = uri.slice(URI_PREFIX.length);
  const segments = path.split('/');

  if (segments.length !== 3) {
    return {
      ok: false,
      reason: `URI must have exactly 3 path segments separated by '/' (got ${segments.length})`,
    };
  }

  const [moduleId, type, id] = segments;
  if (!moduleId || !type || !id) {
    return { ok: false, reason: 'URI segments must be non-empty' };
  }

  if (!SLUG_RE.test(moduleId)) {
    return { ok: false, reason: `moduleId '${moduleId}' must be lowercase kebab-case` };
  }
  if (!SLUG_RE.test(type)) {
    return { ok: false, reason: `type '${type}' must be lowercase kebab-case` };
  }
  if (id !== id.toLowerCase()) {
    return { ok: false, reason: `id '${id}' must be lowercase` };
  }

  return { ok: true, parsed: { moduleId, type, id } };
}
