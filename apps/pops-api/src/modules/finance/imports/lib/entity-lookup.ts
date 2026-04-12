/**
 * Entity lookup and alias map loader.
 *
 * Builds two Maps from all entities in the database:
 * - entityLookup: lowercase name → { id, name (original case) }
 * - aliasMap: lowercase alias → entity name (original case)
 *
 * Both maps are loaded once per import batch and shared across
 * all matching stages (correction, prefix, contains, etc.).
 */
import { entities } from '@pops/db-types';
import { isNotNull } from 'drizzle-orm';

import { getDrizzle } from '../../../../db.js';

export interface EntityEntry {
  id: string;
  /** Original-case entity name as stored in the database */
  name: string;
}

export interface EntityMaps {
  /** Lowercase entity name → { id, name (original case) } */
  entityLookup: Map<string, EntityEntry>;
  /** Lowercase alias → entity name (original case) */
  aliasMap: Map<string, string>;
}

/**
 * Load entity lookup and alias maps from the database.
 *
 * - Entity lookup keys are lowercased for O(1) case-insensitive lookups
 * - Values preserve the original-case name for display
 * - Aliases are parsed from comma-separated strings per entity
 * - Whitespace-only aliases are filtered out
 */
export function loadEntityMaps(): EntityMaps {
  const db = getDrizzle();

  const entityLookup = new Map<string, EntityEntry>();
  const aliasMap = new Map<string, string>();

  // Load all entities for the name → { id, name } lookup
  const allRows = db.select({ name: entities.name, id: entities.id }).from(entities).all();
  for (const row of allRows) {
    entityLookup.set(row.name.toLowerCase(), { id: row.id, name: row.name });
  }

  // Load entities with aliases for the alias → name map
  const aliasRows = db
    .select({ name: entities.name, aliases: entities.aliases })
    .from(entities)
    .where(isNotNull(entities.aliases))
    .all();

  for (const row of aliasRows) {
    if (!row.aliases) continue;
    const aliasList = row.aliases.split(',');
    for (const raw of aliasList) {
      const alias = raw.trim();
      if (alias.length === 0) continue; // skip whitespace-only
      aliasMap.set(alias.toLowerCase(), row.name);
    }
  }

  return { entityLookup, aliasMap };
}

/**
 * Build entity maps from in-memory data (for testing without DB).
 */
export function buildEntityMaps(
  entitiesData: { name: string; id: string; aliases?: string | null }[]
): EntityMaps {
  const entityLookup = new Map<string, EntityEntry>();
  const aliasMap = new Map<string, string>();

  for (const entity of entitiesData) {
    entityLookup.set(entity.name.toLowerCase(), { id: entity.id, name: entity.name });

    if (entity.aliases) {
      const aliasList = entity.aliases.split(',');
      for (const raw of aliasList) {
        const alias = raw.trim();
        if (alias.length === 0) continue;
        aliasMap.set(alias.toLowerCase(), entity.name);
      }
    }
  }

  return { entityLookup, aliasMap };
}
