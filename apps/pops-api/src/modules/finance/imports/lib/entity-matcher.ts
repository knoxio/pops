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

import type { EntityEntry } from "./entity-lookup.js";

/** Map-based entity lookup: lowercase name → { id, name } */
export type EntityLookupMap = Map<string, EntityEntry>;

/** Map-based alias map: lowercase alias → entity name (original case) */
export type AliasMap = Map<string, string>;

export interface EntityMatch {
  entityName: string;
  entityId: string;
  matchType: "alias" | "exact" | "prefix" | "contains";
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
        return { entityName: entry.name, entityId: entry.id, matchType: "alias" };
      }
    }
  }

  // Try matching with original names, then with stripped punctuation
  const result = tryMatch(normalized, entityLookup);
  if (result) return result;

  // Stage 5: Strip punctuation and retry
  const stripped = normalized.replace(/[''`]/g, "");
  const strippedResult = tryMatch(stripped, entityLookup, true);
  if (strippedResult) return strippedResult;

  return null;
}

function tryMatch(
  normalized: string,
  entityLookup: EntityLookupMap,
  stripPunctuation = false
): EntityMatch | null {
  const entries = Array.from(entityLookup.entries());

  // Stage 2: Exact match (case-insensitive)
  for (const [key, entry] of entries) {
    const matchKey = stripPunctuation ? key.replace(/[''`]/g, "") : key;
    if (normalized === matchKey.toUpperCase()) {
      return { entityName: entry.name, entityId: entry.id, matchType: "exact" };
    }
  }

  // Stage 3: Prefix match (longest entity name wins)
  let bestPrefix: EntityMatch | null = null;
  for (const [key, entry] of entries) {
    const matchKey = stripPunctuation ? key.replace(/[''`]/g, "") : key;
    const upper = matchKey.toUpperCase();
    if (normalized.startsWith(upper)) {
      if (!bestPrefix || entry.name.length > bestPrefix.entityName.length) {
        bestPrefix = { entityName: entry.name, entityId: entry.id, matchType: "prefix" };
      }
    }
  }
  if (bestPrefix) return bestPrefix;

  // Stage 4: Contains match (min 4 chars, longest entity name wins)
  let bestContains: EntityMatch | null = null;
  for (const [key, entry] of entries) {
    if (key.length < 4) continue;
    const matchKey = stripPunctuation ? key.replace(/[''`]/g, "") : key;
    const upper = matchKey.toUpperCase();
    if (normalized.includes(upper)) {
      if (!bestContains || entry.name.length > bestContains.entityName.length) {
        bestContains = { entityName: entry.name, entityId: entry.id, matchType: "contains" };
      }
    }
  }
  if (bestContains) return bestContains;

  return null;
}

/** Find an entity by name (case-insensitive) in the lookup */
function findByName(entityName: string, lookup: EntityLookupMap): EntityEntry | undefined {
  return lookup.get(entityName.toLowerCase());
}
