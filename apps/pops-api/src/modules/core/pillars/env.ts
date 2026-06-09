/**
 * `POPS_PILLARS` environment variable parser (ADR-026 pre-flight P2).
 *
 * The pillar registry is sourced from a single comma-separated env var so the
 * platform never reaches into a config file or service discovery system at
 * boot — a deployer sets `POPS_PILLARS` per environment and the registry view
 * derives from it.
 *
 * Format: `id:baseUrl[,id:baseUrl,...]`
 *   - `id` is a lowercase kebab-case pillar slug (`food`, `finance`,
 *     `core-experimental`).
 *   - `baseUrl` is a fully-qualified HTTP origin (`http://food-api:3000`).
 *     Trailing slashes are stripped so callers can append `/uri/resolve`
 *     without a double-slash.
 *   - Whitespace around either side of `:` and `,` is tolerated.
 *
 * The parser is strict: malformed input throws rather than silently dropping
 * entries. Boot-time validation surfaces deploy-config bugs before any tRPC
 * request hits a half-broken registry.
 */

import type { PillarRegistryEntry } from '@pops/types';

const PILLAR_ID_RE = /^[a-z0-9-]+$/;

export interface ParsePillarsEnvOptions {
  /**
   * When true (default), an empty / undefined input returns an empty registry
   * — useful for environments without pillars yet (today: pre-migration). When
   * false, an empty input throws, which is the right behaviour during a
   * deployment that explicitly requires the variable to be set.
   */
  readonly allowEmpty?: boolean;
}

export class PillarsEnvParseError extends Error {
  constructor(message: string) {
    super(`POPS_PILLARS: ${message}`);
    this.name = 'PillarsEnvParseError';
  }
}

/**
 * Parse `POPS_PILLARS` into a typed list of registry entries.
 *
 * Throws `PillarsEnvParseError` on any structural problem: empty when not
 * allowed, malformed pair, duplicate id, invalid id slug, missing colon,
 * non-http(s) URL, etc. Returning early on the first error is intentional —
 * the deployer should fix one bug at a time rather than chase a multi-error
 * report.
 */
export function parsePillarsEnv(
  raw: string | undefined,
  options: ParsePillarsEnvOptions = {}
): readonly PillarRegistryEntry[] {
  const { allowEmpty = true } = options;
  const trimmed = (raw ?? '').trim();

  if (trimmed.length === 0) {
    if (allowEmpty) return [];
    throw new PillarsEnvParseError('value is empty');
  }

  const entries: PillarRegistryEntry[] = [];
  const seenIds = new Set<string>();

  for (const rawPair of trimmed.split(',')) {
    const entry = parsePillarEntry(rawPair, seenIds);
    seenIds.add(entry.id);
    entries.push(entry);
  }

  return entries;
}

function parsePillarEntry(rawPair: string, seenIds: ReadonlySet<string>): PillarRegistryEntry {
  const pair = rawPair.trim();
  if (pair.length === 0) {
    throw new PillarsEnvParseError('empty entry between commas — remove the stray comma or value');
  }

  // The pair format is `id:baseUrl`. baseUrl contains a `:` (in `http://`)
  // so we split on the FIRST colon only.
  const colonIdx = pair.indexOf(':');
  if (colonIdx === -1) {
    throw new PillarsEnvParseError(`entry '${pair}' missing ':' between id and baseUrl`);
  }

  const id = pair.slice(0, colonIdx).trim();
  const baseUrlRaw = pair.slice(colonIdx + 1).trim();

  validatePillarId(id, pair, seenIds);
  const baseUrl = parseBaseUrl(id, baseUrlRaw);

  return { id, baseUrl };
}

function validatePillarId(id: string, pair: string, seenIds: ReadonlySet<string>): void {
  if (id.length === 0) {
    throw new PillarsEnvParseError(`entry '${pair}' has empty id`);
  }
  if (!PILLAR_ID_RE.test(id)) {
    throw new PillarsEnvParseError(`pillar id '${id}' must be lowercase kebab-case ([a-z0-9-]+)`);
  }
  if (seenIds.has(id)) {
    throw new PillarsEnvParseError(`duplicate pillar id '${id}'`);
  }
}

function parseBaseUrl(id: string, baseUrlRaw: string): string {
  if (baseUrlRaw.length === 0) {
    throw new PillarsEnvParseError(`pillar '${id}' has empty baseUrl`);
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrlRaw);
  } catch {
    throw new PillarsEnvParseError(`pillar '${id}' baseUrl '${baseUrlRaw}' is not a valid URL`);
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new PillarsEnvParseError(`pillar '${id}' baseUrl '${baseUrlRaw}' must use http or https`);
  }
  // Require a bare origin — no path, query, or fragment. The dispatcher
  // builds endpoints by appending `/uri/resolve`; allowing a path prefix
  // would silently route to the wrong handler (e.g. `${baseUrl}/api/uri/resolve`).
  if (
    (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '') ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== ''
  ) {
    throw new PillarsEnvParseError(
      `pillar '${id}' baseUrl '${baseUrlRaw}' must be a bare origin (no path, query, or fragment)`
    );
  }
  // Normalise via URL.origin so the stored value has no trailing slash and
  // callers can always append paths cleanly.
  return parsedUrl.origin;
}
