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

/** @deprecated Use Map-based EntityLookupMap instead */
export interface EntityLookup {
  [name: string]: string;
}

/** Map-based entity lookup: name → entity ID */
export type EntityLookupMap = Map<string, string>;

/** Map-based alias map: alias → entity name */
export type AliasMap = Map<string, string>;

export interface EntityMatch {
  entityName: string;
  entityId: string;
  matchType: "alias" | "exact" | "prefix" | "contains";
}

/**
 * Match a transaction description to an entity.
 *
 * Accepts either Map-based lookups (preferred) or plain objects (legacy).
 */
export function matchEntity(
  description: string,
  entityLookup: EntityLookupMap | EntityLookup,
  aliases: AliasMap | Record<string, string>
): EntityMatch | null {
  const normalized = description.toUpperCase().trim();

  // Normalize to iterables
  const aliasEntries: Iterable<[string, string]> =
    aliases instanceof Map ? aliases : Object.entries(aliases);
  const lookupEntries: Iterable<[string, string]> =
    entityLookup instanceof Map ? entityLookup : Object.entries(entityLookup);

  // Stage 1: Manual aliases
  for (const [key, entityName] of aliasEntries) {
    if (normalized.includes(key.toUpperCase())) {
      const entityId = findInEntries(entityName, lookupEntries);
      if (entityId) {
        return { entityName, entityId, matchType: "alias" };
      }
    }
  }

  // Try matching with original names, then with stripped punctuation
  const result = tryMatch(normalized, lookupEntries);
  if (result) return result;

  // Stage 5: Strip punctuation and retry
  const stripped = normalized.replace(/[''`]/g, "");
  const strippedResult = tryMatch(stripped, lookupEntries, true);
  if (strippedResult) return strippedResult;

  return null;
}

function tryMatch(
  normalized: string,
  lookupEntries: Iterable<[string, string]>,
  stripPunctuation = false
): EntityMatch | null {
  const entries = Array.from(lookupEntries);

  // Stage 2: Exact match (case-insensitive)
  for (const [name, id] of entries) {
    const entityName = stripPunctuation ? name.replace(/[''`]/g, "") : name;
    if (normalized === entityName.toUpperCase()) {
      return { entityName: name, entityId: id, matchType: "exact" };
    }
  }

  // Stage 3: Prefix match (longest entity name wins)
  let bestPrefix: EntityMatch | null = null;
  for (const [name, id] of entries) {
    const entityName = stripPunctuation ? name.replace(/[''`]/g, "") : name;
    const upper = entityName.toUpperCase();
    if (normalized.startsWith(upper)) {
      if (!bestPrefix || name.length > bestPrefix.entityName.length) {
        bestPrefix = { entityName: name, entityId: id, matchType: "prefix" };
      }
    }
  }
  if (bestPrefix) return bestPrefix;

  // Stage 4: Contains match (min 4 chars, longest entity name wins)
  let bestContains: EntityMatch | null = null;
  for (const [name, id] of entries) {
    if (name.length < 4) continue;
    const entityName = stripPunctuation ? name.replace(/[''`]/g, "") : name;
    const upper = entityName.toUpperCase();
    if (normalized.includes(upper)) {
      if (!bestContains || name.length > bestContains.entityName.length) {
        bestContains = { entityName: name, entityId: id, matchType: "contains" };
      }
    }
  }
  if (bestContains) return bestContains;

  return null;
}

function findInEntries(
  entityName: string,
  lookupEntries: Iterable<[string, string]>
): string | undefined {
  const upper = entityName.toUpperCase();
  for (const [key, value] of lookupEntries) {
    if (key.toUpperCase() === upper) return value;
  }
  return undefined;
}
