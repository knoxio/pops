/**
 * 5-stage entity matching pipeline.
 *
 * 1. Manual aliases — map of descriptions to entity names
 * 2. Exact match — case-insensitive against entity lookup
 * 3. Prefix match — description starts with entity name (longest wins)
 * 4. Contains match — entity name found anywhere in description (min 4 chars, longest wins)
 * 5. Punctuation stripping — removes apostrophes, retries stages 2-4
 *
 * AI fallback (stage 6) is handled separately.
 * Hit rate: ~95-100% with aliases.
 */

import type { EntityEntry } from './entity-lookup.js';

/** Map-based entity lookup: lowercase name → { id, name } */
export type EntityLookupMap = Map<string, EntityEntry>;

/** Map-based alias map: lowercase alias → entity name (original case) */
export type AliasMap = Map<string, string>;

export interface EntityMatch {
  entityName: string;
  entityId: string;
  matchType: 'alias' | 'exact' | 'prefix' | 'contains';
}

/**
 * Match a transaction description to an entity.
 */
export function matchEntity(
  description: string,
  entityLookup: EntityLookupMap,
  aliases: AliasMap
): EntityMatch | null {
  const normalized = description.toUpperCase().trim();

  // Stage 1: Manual aliases
  for (const [key, entityName] of aliases) {
    if (normalized.includes(key.toUpperCase())) {
      const entry = findByName(entityName, entityLookup);
      if (entry) {
        return { entityName: entry.name, entityId: entry.id, matchType: 'alias' };
      }
    }
  }

  // Try matching with original names, then with stripped punctuation
  const result = tryMatch(normalized, entityLookup);
  if (result) return result;

  // Stage 5: Strip punctuation and retry
  const stripped = normalized.replaceAll(/[''`]/g, '');
  const strippedResult = tryMatch(stripped, entityLookup, true);
  if (strippedResult) return strippedResult;

  return null;
}

function normalizeKey(key: string, stripPunctuation: boolean): string {
  const stripped = stripPunctuation ? key.replaceAll(/[''`]/g, '') : key;
  return stripped.toUpperCase();
}

function findExactMatch(
  normalized: string,
  entries: [string, EntityEntry][],
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
  entries: [string, EntityEntry][],
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
  entries: [string, EntityEntry][],
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

/** Find an entity by name (case-insensitive) in the lookup */
function findByName(entityName: string, lookup: EntityLookupMap): EntityEntry | undefined {
  return lookup.get(entityName.toLowerCase());
}
