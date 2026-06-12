/**
 * Plexus row serialisation helpers.
 *
 * Extracted so the SQL seam in `plexus.ts` stays focused on queries and so
 * tests can exercise the deserialisation logic in isolation. The `config`
 * column is JSON-encoded by callers (the encrypted envelope is a JSON
 * blob); a corrupt blob deserialises to `null` rather than throwing so a
 * single broken row can't bring the registry listing down.
 */
import type { plexusAdapters, plexusFilters } from '../schema.js';
import type {
  PlexusAdapter,
  PlexusAdapterStatus,
  PlexusFilter,
  PlexusFilterType,
} from './plexus-types.js';

/**
 * Best-effort parse of the JSON `config` envelope. Returns `null` for
 * empty / unparseable values so the listing endpoint can keep rendering
 * even if a single adapter has a corrupt blob on disk.
 */
export function parseAdapterConfig(raw: string | null): Record<string, unknown> | null {
  if (raw == null || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Deserialise a row from `plexus_adapters` into a `PlexusAdapter`. */
export function rowToAdapter(row: typeof plexusAdapters.$inferSelect): PlexusAdapter {
  return {
    id: row.id,
    name: row.name,
    status: row.status as PlexusAdapterStatus,
    config: parseAdapterConfig(row.config),
    lastHealth: row.lastHealth,
    lastError: row.lastError,
    ingestedCount: row.ingestedCount,
    emittedCount: row.emittedCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Deserialise a row from `plexus_filters` into a `PlexusFilter`. */
export function rowToFilter(row: typeof plexusFilters.$inferSelect): PlexusFilter {
  return {
    id: row.id,
    adapterId: row.adapterId,
    filterType: row.filterType as PlexusFilterType,
    field: row.field,
    pattern: row.pattern,
    enabled: row.enabled === 1,
  };
}
