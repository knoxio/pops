/**
 * `POPS_PILLARS` environment variable parser inside the food-api process.
 *
 * Format: `id:baseUrl[,id:baseUrl,...]`
 *   - `id` lowercase kebab-case pillar slug (`food`, `finance`, …)
 *   - `baseUrl` fully-qualified http(s) origin (trailing slashes stripped)
 *   - whitespace around `:` and `,` tolerated
 *
 * Strict: malformed input throws rather than silently dropping entries.
 */

import type { PillarRegistryEntry } from '@pops/types';

const PILLAR_ID_RE = /^[a-z0-9-]+$/;

export interface ParsePillarsEnvOptions {
  /**
   * When true (default), empty / undefined input returns an empty registry.
   * When false, empty input throws — useful for deploys that require
   * the variable to be set explicitly.
   */
  readonly allowEmpty?: boolean;
}

export class PillarsEnvParseError extends Error {
  override readonly name = 'PillarsEnvParseError' as const;

  constructor(message: string) {
    super(`POPS_PILLARS: ${message}`);
  }
}

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
  const colon = pair.indexOf(':');
  if (colon === -1) {
    throw new PillarsEnvParseError(`entry "${pair}" is missing a colon — expected id:baseUrl`);
  }
  const id = pair.slice(0, colon).trim();
  const baseUrlRaw = pair.slice(colon + 1).trim();
  if (id.length === 0) {
    throw new PillarsEnvParseError(`entry "${pair}" is missing the id half`);
  }
  if (!PILLAR_ID_RE.test(id)) {
    throw new PillarsEnvParseError(`id "${id}" is not lowercase kebab-case ([a-z0-9-]+)`);
  }
  if (seenIds.has(id)) {
    throw new PillarsEnvParseError(`duplicate pillar id "${id}"`);
  }
  if (baseUrlRaw.length === 0) {
    throw new PillarsEnvParseError(`entry "${pair}" is missing the baseUrl half`);
  }
  return { id, baseUrl: parseBareOrigin(`pillar '${id}'`, baseUrlRaw) };
}

/**
 * Parse `raw` as a bare http(s) origin. Throws if it carries a path,
 * query, or fragment so consumers can append URL paths cleanly without
 * silently routing through a prefix. Reused by `selfBaseUrl` validation
 * and the per-entry parser above so both surfaces enforce the same
 * `PillarRegistryEntry.baseUrl` contract.
 */
export function parseBareOrigin(label: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PillarsEnvParseError(`${label} baseUrl "${raw}" is not a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PillarsEnvParseError(
      `${label} baseUrl "${raw}" must use http or https; got ${url.protocol}`
    );
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '') {
    throw new PillarsEnvParseError(
      `${label} baseUrl "${raw}" must be a bare origin (no path, query, or fragment)`
    );
  }
  return url.origin;
}
