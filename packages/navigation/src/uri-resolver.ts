/**
 * Resolves POPS URIs (pops:{app}/{type}/{id}) to frontend routes.
 *
 * Each search adapter produces URIs like "pops:media/movie/42". This module
 * maps those to the correct frontend route ("/media/movies/42") so that
 * clicking a search result navigates to the right page.
 */

/** Map of {app}/{type} → route prefix. */
const URI_ROUTE_MAP: Record<string, string> = {
  "media/movie": "/media/movies",
  "media/tv-show": "/media/tv",
  "finance/transaction": "/finance/transactions",
  "finance/entity": "/finance/entities",
  "finance/budget": "/finance/budgets",
  "inventory/item": "/inventory/items",
};

/**
 * Resolve a POPS URI to a frontend route path.
 *
 * @param uri - A URI like "pops:media/movie/42"
 * @returns The frontend route (e.g. "/media/movies/42"), or null if unresolvable.
 */
export function resolveUri(uri: string): string | null {
  if (!uri.startsWith("pops:")) return null;

  const rest = uri.slice(5); // Remove "pops:" prefix
  const lastSlash = rest.lastIndexOf("/");
  if (lastSlash === -1) return null;

  const prefix = rest.slice(0, lastSlash); // e.g. "media/movie"
  const id = rest.slice(lastSlash + 1); // e.g. "42"
  if (!id) return null;

  const routePrefix = URI_ROUTE_MAP[prefix];
  if (!routePrefix) return null;

  return `${routePrefix}/${id}`;
}
