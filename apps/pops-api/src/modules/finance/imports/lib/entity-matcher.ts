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

export interface EntityLookup {
  [name: string]: string;
}

export interface EntityMatch {
  entityName: string;
  entityId: string;
  matchType: "alias" | "exact" | "prefix" | "contains";
}

export function matchEntity(
  description: string,
  entityLookup: EntityLookup,
  aliases: Record<string, string>
): EntityMatch | null {
  const normalized = description.toUpperCase().trim();

  // Stage 1: Manual aliases
  const aliasKey = Object.keys(aliases).find((key) => normalized.includes(key.toUpperCase()));
  if (aliasKey) {
    const entityName = aliases[aliasKey];
    if (entityName === undefined) return null;
    const entityId = findInLookup(entityName, entityLookup);
    if (entityId) {
      return { entityName, entityId, matchType: "alias" };
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
  entityLookup: EntityLookup,
  stripPunctuation = false
): EntityMatch | null {
  const entries = Object.entries(entityLookup);

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

function findInLookup(entityName: string, lookup: EntityLookup): string | undefined {
  // Case-insensitive lookup
  const key = Object.keys(lookup).find((k) => k.toUpperCase() === entityName.toUpperCase());
  return key ? lookup[key] : undefined;
}
