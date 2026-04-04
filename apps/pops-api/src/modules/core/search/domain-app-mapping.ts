/**
 * Domain-to-app mapping for search context section ordering.
 *
 * Maps each search adapter domain to the app it belongs to, allowing the
 * fan-out engine to determine which sections are "context sections" (belonging
 * to the currently active app) and order them first.
 */

const DOMAIN_APP_MAP: Record<string, string> = {
  movies: "media",
  "tv-shows": "media",
  transactions: "finance",
  entities: "finance",
  budgets: "finance",
  "inventory-items": "inventory",
};

/**
 * Returns the app name for a given search adapter domain, or null if unknown.
 *
 * @example
 * getDomainApp("movies")          // "media"
 * getDomainApp("transactions")    // "finance"
 * getDomainApp("inventory-items") // "inventory"
 * getDomainApp("unknown")         // null
 */
export function getDomainApp(domain: string): string | null {
  return DOMAIN_APP_MAP[domain] ?? null;
}

/**
 * Returns true if the given domain belongs to the current app.
 * Used by the fan-out engine to mark sections as context sections.
 *
 * @example
 * isContextDomain("movies", "media")       // true
 * isContextDomain("transactions", "media") // false
 * isContextDomain("unknown", "finance")    // false
 */
export function isContextDomain(domain: string, currentApp: string): boolean {
  return getDomainApp(domain) === currentApp;
}
