/**
 * Domain-to-app mapping for search context section ordering.
 *
 * Relocated from the monolith engine
 * (`apps/pops-api/src/modules/core/search/domain-app-mapping.ts`). Maps each
 * search section domain to the app it belongs to so the federator can mark
 * "context sections" (belonging to the currently active app) and order them
 * first.
 *
 * Carries BOTH granularities:
 *   - the monolith's fine-grained adapter domains (`transactions`, `budgets`,
 *     …) so the mapping stays correct if a section is ever decorated at
 *     adapter granularity again, and
 *   - the pillar-level section domains the federation source emits today
 *     (`finance`, `inventory`, `contacts`) — one section per pillar, because a
 *     pillar's `/search` returns a single flat hit list.
 *
 * The `entities` adapter domain now belongs to the contacts pillar (PRD-163);
 * a `contacts` pillar-level key is added alongside it.
 */

const DOMAIN_APP_MAP: Record<string, string> = {
  movies: 'media',
  'tv-shows': 'media',
  transactions: 'finance',
  entities: 'contacts',
  budgets: 'finance',
  wishlist: 'finance',
  'inventory-items': 'inventory',
  finance: 'finance',
  inventory: 'inventory',
  core: 'core',
  contacts: 'contacts',
};

/**
 * Returns the app name for a given search section domain, or null if unknown.
 *
 * @example
 * getDomainApp("finance")         // "finance"
 * getDomainApp("transactions")    // "finance"
 * getDomainApp("inventory")       // "inventory"
 * getDomainApp("unknown")         // null
 */
export function getDomainApp(domain: string): string | null {
  return DOMAIN_APP_MAP[domain] ?? null;
}

/**
 * Returns true if the given domain belongs to the current app. Used by the
 * federator to mark sections as context sections.
 *
 * @example
 * isContextDomain("finance", "finance")       // true
 * isContextDomain("transactions", "finance")  // true
 * isContextDomain("transactions", "media")    // false
 * isContextDomain("unknown", "finance")       // false
 */
export function isContextDomain(domain: string, currentApp: string): boolean {
  return getDomainApp(domain) === currentApp;
}
