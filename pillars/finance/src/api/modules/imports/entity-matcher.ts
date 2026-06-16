/**
 * 5-stage entity matching pipeline (pure, no DB).
 *
 *   1. Manual aliases — alias substring → entity name
 *   2. Exact match — case-insensitive against the entity lookup
 *   3. Prefix match — description starts with entity name (longest wins)
 *   4. Contains match — entity name anywhere in description (min 4 chars, longest wins)
 *   5. Punctuation stripping — drop apostrophes, retry stages 2-4
 *
 * The AI fallback (stage 6) is handled by the caller. Copied verbatim from the
 * monolith `lib/entity-matcher.ts`.
 */
import type { EntityLookupEntry } from '../../../db/index.js';

export type EntityLookupMap = Map<string, EntityLookupEntry>;
export type AliasMap = Map<string, string>;

export interface EntityMatch {
  entityName: string;
  entityId: string;
  matchType: 'alias' | 'exact' | 'prefix' | 'contains';
}

function normalizeKey(key: string, stripPunctuation: boolean): string {
  const stripped = stripPunctuation ? key.replaceAll(/[''`]/g, '') : key;
  return stripped.toUpperCase();
}

function findExactMatch(
  normalized: string,
  entries: [string, EntityLookupEntry][],
  stripPunctuation: boolean
): EntityMatch | null {
  for (const [key, entry] of entries) {
    if (normalized === normalizeKey(key, stripPunctuation)) {
      return { entityName: entry.name, entityId: entry.id, matchType: 'exact' };
    }
  }
  return null;
}

function findPrefixMatch(
  normalized: string,
  entries: [string, EntityLookupEntry][],
  stripPunctuation: boolean
): EntityMatch | null {
  let best: EntityMatch | null = null;
  for (const [key, entry] of entries) {
    const upper = normalizeKey(key, stripPunctuation);
    if (!normalized.startsWith(upper)) continue;
    if (!best || entry.name.length > best.entityName.length) {
      best = { entityName: entry.name, entityId: entry.id, matchType: 'prefix' };
    }
  }
  return best;
}

function findContainsMatch(
  normalized: string,
  entries: [string, EntityLookupEntry][],
  stripPunctuation: boolean
): EntityMatch | null {
  let best: EntityMatch | null = null;
  for (const [key, entry] of entries) {
    if (key.length < 4) continue;
    const upper = normalizeKey(key, stripPunctuation);
    if (!normalized.includes(upper)) continue;
    if (!best || entry.name.length > best.entityName.length) {
      best = { entityName: entry.name, entityId: entry.id, matchType: 'contains' };
    }
  }
  return best;
}

function tryMatch(
  normalized: string,
  entityLookup: EntityLookupMap,
  stripPunctuation = false
): EntityMatch | null {
  const entries = [...entityLookup.entries()];
  return (
    findExactMatch(normalized, entries, stripPunctuation) ??
    findPrefixMatch(normalized, entries, stripPunctuation) ??
    findContainsMatch(normalized, entries, stripPunctuation)
  );
}

function findByName(entityName: string, lookup: EntityLookupMap): EntityLookupEntry | undefined {
  return lookup.get(entityName.toLowerCase());
}

/** Match a transaction description to an entity, or null if no stage hits. */
export function matchEntity(
  description: string,
  entityLookup: EntityLookupMap,
  aliases: AliasMap
): EntityMatch | null {
  const normalized = description.toUpperCase().trim();

  for (const [key, entityName] of aliases) {
    if (normalized.includes(key.toUpperCase())) {
      const entry = findByName(entityName, entityLookup);
      if (entry) return { entityName: entry.name, entityId: entry.id, matchType: 'alias' };
    }
  }

  const result = tryMatch(normalized, entityLookup);
  if (result) return result;

  const stripped = normalized.replaceAll(/[''`]/g, '');
  return tryMatch(stripped, entityLookup, true);
}
