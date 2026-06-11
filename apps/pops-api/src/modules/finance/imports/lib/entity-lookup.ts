/**
 * Thin shim forwarding `loadEntityMaps` to `@pops/finance-db`'s
 * `importsService`. `buildEntityMaps` stays in-tree — it's a pure
 * in-memory helper consumed only by unit tests, not a persistence
 * primitive.
 *
 * Track N6 phase 1 PR 3 cutover. The package exposes the type as
 * `EntityLookupEntry`; we re-export it under the in-tree name
 * `EntityEntry` so existing consumers (`entity-matcher.ts`,
 * `process-transaction-helpers.ts`, `correction-application.ts`)
 * compile unchanged. PR 4 will retire the shim.
 */
import { importsService, type EntityLookupEntry, type EntityMaps } from '@pops/finance-db';

import { getFinanceDrizzle } from '../../../../db/finance-handle.js';

export type EntityEntry = EntityLookupEntry;
export type { EntityMaps };

export function loadEntityMaps(): EntityMaps {
  return importsService.loadEntityMaps(getFinanceDrizzle());
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
    if (!entity.aliases) continue;
    for (const raw of entity.aliases.split(',')) {
      const alias = raw.trim();
      if (alias.length === 0) continue;
      aliasMap.set(alias.toLowerCase(), entity.name);
    }
  }

  return { entityLookup, aliasMap };
}
