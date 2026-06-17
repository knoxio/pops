/**
 * Cross-pillar enrichment clients for semantic-search metadata resolution.
 *
 * The monolith resolver (`semantic-search-metadata.ts`) joined `engram_index`
 * against `transactions` (`@pops/finance-db`), `movies` / `tv_shows`
 * (`@pops/media-db`) and `home_inventory` (`@pops/inventory-db`) in a single
 * SQL handle. Those tables no longer live in the cerebrum file, so enrichment
 * for cross-pillar source types is fetched over REST from the owning pillar
 * (bare `fetch`, docker-network trust → no auth header). The base URLs are
 * resolved from `POPS_PILLARS`.
 *
 * Each peer endpoint returns `{ data: Schema }`. We hand-type a minimal shape
 * per peer (only the fields the formatters use) rather than importing the
 * peers' generated `api-types` — that would couple cerebrum's build to the
 * peers' `dist/` artifacts for four scalar fields.
 *
 * Graceful absence: if a peer is not present in `POPS_PILLARS`, its client is
 * `undefined` and enrichment for that source type is skipped (the engram-only
 * leg still works; the cross-pillar hit is simply dropped — the monolith
 * returned `null` metadata for an unresolvable domain row too). A live fetch
 * failure surfaces as a thrown error caught by the hybrid fallback.
 */
import { parsePillarsEnv } from '../../pillars/env.js';

export interface FinanceTransactionRow {
  description?: string | null;
  entityName?: string | null;
  tags?: string[] | null;
  notes?: string | null;
}

export interface MediaMovieRow {
  title?: string | null;
  overview?: string | null;
  genres?: string[] | null;
}

export interface MediaTvShowRow {
  name?: string | null;
  overview?: string | null;
  genres?: string[] | null;
}

export interface InventoryItemRow {
  itemName?: string | null;
  brand?: string | null;
  type?: string | null;
  location?: string | null;
}

export interface PeerClients {
  finance?: { getTransaction(id: string): Promise<FinanceTransactionRow | null> };
  media?: {
    getMovie(id: number): Promise<MediaMovieRow | null>;
    getTvShow(id: number): Promise<MediaTvShowRow | null>;
  };
  inventory?: { getItem(id: string): Promise<InventoryItemRow | null> };
}

type FetchImpl = typeof globalThis.fetch;

function resolvePeerBaseUrl(id: string): string | undefined {
  return parsePillarsEnv(process.env['POPS_PILLARS']).find((p) => p.id === id)?.baseUrl;
}

async function getData<T>(
  fetchImpl: FetchImpl,
  baseUrl: string,
  path: string,
  label: string
): Promise<T | null> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${label} → HTTP ${res.status}`);
  const text = await res.text();
  if (text.length === 0) return null;
  const json = JSON.parse(text) as { data?: T };
  return json.data ?? null;
}

/**
 * Build the cross-pillar enrichment clients from `POPS_PILLARS`. A peer absent
 * from the registry yields an `undefined` client for that source type.
 */
export function resolvePeerClientsFromEnv(fetchImpl: FetchImpl = globalThis.fetch): PeerClients {
  const financeUrl = resolvePeerBaseUrl('finance');
  const mediaUrl = resolvePeerBaseUrl('media');
  const inventoryUrl = resolvePeerBaseUrl('inventory');

  return {
    finance:
      financeUrl === undefined
        ? undefined
        : {
            getTransaction: (id) =>
              getData<FinanceTransactionRow>(
                fetchImpl,
                financeUrl,
                `/transactions/${encodeURIComponent(id)}`,
                'finance GET /transactions/:id'
              ),
          },
    media:
      mediaUrl === undefined
        ? undefined
        : {
            getMovie: (id) =>
              getData<MediaMovieRow>(fetchImpl, mediaUrl, `/movies/${id}`, 'media GET /movies/:id'),
            getTvShow: (id) =>
              getData<MediaTvShowRow>(
                fetchImpl,
                mediaUrl,
                `/tv-shows/${id}`,
                'media GET /tv-shows/:id'
              ),
          },
    inventory:
      inventoryUrl === undefined
        ? undefined
        : {
            getItem: (id) =>
              getData<InventoryItemRow>(
                fetchImpl,
                inventoryUrl,
                `/items/${encodeURIComponent(id)}`,
                'inventory GET /items/:id'
              ),
          },
  };
}
