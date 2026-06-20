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

/** A page of rows returned by a peer LIST endpoint (`{ data, pagination }`). */
export interface PeerPage<T> {
  rows: T[];
  hasMore: boolean;
}

/**
 * Cross-source scan rows carry the owning-pillar primary key alongside the
 * formatter fields. The thalamus cross-source indexer pages through these to
 * enqueue embedding jobs for changed rows.
 */
export interface FinanceTransactionListRow extends FinanceTransactionRow {
  id: string;
}
export interface MediaMovieListRow extends MediaMovieRow {
  id: number;
}
export interface MediaTvShowListRow extends MediaTvShowRow {
  id: number;
}
export interface InventoryItemListRow extends InventoryItemRow {
  id: string;
}

export interface PeerClients {
  finance?: {
    getTransaction(id: string): Promise<FinanceTransactionRow | null>;
    listTransactions(limit: number, offset: number): Promise<PeerPage<FinanceTransactionListRow>>;
  };
  media?: {
    getMovie(id: number): Promise<MediaMovieRow | null>;
    getTvShow(id: number): Promise<MediaTvShowRow | null>;
    listMovies(limit: number, offset: number): Promise<PeerPage<MediaMovieListRow>>;
    listTvShows(limit: number, offset: number): Promise<PeerPage<MediaTvShowListRow>>;
  };
  inventory?: {
    getItem(id: string): Promise<InventoryItemRow | null>;
    listItems(limit: number, offset: number): Promise<PeerPage<InventoryItemListRow>>;
  };
}

type FetchImpl = typeof globalThis.fetch;

interface PeerPaginationEnvelope<T> {
  data?: T[];
  pagination?: { hasMore?: boolean };
}

function resolvePeerBaseUrl(id: string): string | undefined {
  return parsePillarsEnv(process.env['POPS_PILLARS']).find((p) => p.id === id)?.baseUrl;
}

async function fetchJson(
  fetchImpl: FetchImpl,
  baseUrl: string,
  path: string,
  label: string
): Promise<{ status: number; text: string }> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
  });
  if (res.status === 404) return { status: 404, text: '' };
  if (!res.ok) throw new Error(`${label} → HTTP ${res.status}`);
  return { status: res.status, text: await res.text() };
}

async function getData<T>(
  fetchImpl: FetchImpl,
  baseUrl: string,
  path: string,
  label: string
): Promise<T | null> {
  const { status, text } = await fetchJson(fetchImpl, baseUrl, path, label);
  if (status === 404 || text.length === 0) return null;
  const json = JSON.parse(text) as { data?: T };
  return json.data ?? null;
}

interface ListRequest {
  path: string;
  label: string;
  limit: number;
  offset: number;
}

async function listData<T>(
  fetchImpl: FetchImpl,
  baseUrl: string,
  req: ListRequest
): Promise<PeerPage<T>> {
  const query = `?limit=${req.limit}&offset=${req.offset}`;
  const { status, text } = await fetchJson(fetchImpl, baseUrl, `${req.path}${query}`, req.label);
  if (status === 404 || text.length === 0) return { rows: [], hasMore: false };
  const json = JSON.parse(text) as PeerPaginationEnvelope<T>;
  return { rows: json.data ?? [], hasMore: json.pagination?.hasMore ?? false };
}

function buildFinanceClient(fetchImpl: FetchImpl, baseUrl: string): PeerClients['finance'] {
  return {
    getTransaction: (id) =>
      getData<FinanceTransactionRow>(
        fetchImpl,
        baseUrl,
        `/transactions/${encodeURIComponent(id)}`,
        'finance GET /transactions/:id'
      ),
    listTransactions: (limit, offset) =>
      listData<FinanceTransactionListRow>(fetchImpl, baseUrl, {
        path: '/transactions',
        label: 'finance GET /transactions',
        limit,
        offset,
      }),
  };
}

function buildMediaClient(fetchImpl: FetchImpl, baseUrl: string): PeerClients['media'] {
  return {
    getMovie: (id) =>
      getData<MediaMovieRow>(fetchImpl, baseUrl, `/movies/${id}`, 'media GET /movies/:id'),
    getTvShow: (id) =>
      getData<MediaTvShowRow>(fetchImpl, baseUrl, `/tv-shows/${id}`, 'media GET /tv-shows/:id'),
    listMovies: (limit, offset) =>
      listData<MediaMovieListRow>(fetchImpl, baseUrl, {
        path: '/movies',
        label: 'media GET /movies',
        limit,
        offset,
      }),
    listTvShows: (limit, offset) =>
      listData<MediaTvShowListRow>(fetchImpl, baseUrl, {
        path: '/tv-shows',
        label: 'media GET /tv-shows',
        limit,
        offset,
      }),
  };
}

function buildInventoryClient(fetchImpl: FetchImpl, baseUrl: string): PeerClients['inventory'] {
  return {
    getItem: (id) =>
      getData<InventoryItemRow>(
        fetchImpl,
        baseUrl,
        `/items/${encodeURIComponent(id)}`,
        'inventory GET /items/:id'
      ),
    listItems: (limit, offset) =>
      listData<InventoryItemListRow>(fetchImpl, baseUrl, {
        path: '/items',
        label: 'inventory GET /items',
        limit,
        offset,
      }),
  };
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
    finance: financeUrl === undefined ? undefined : buildFinanceClient(fetchImpl, financeUrl),
    media: mediaUrl === undefined ? undefined : buildMediaClient(fetchImpl, mediaUrl),
    inventory:
      inventoryUrl === undefined ? undefined : buildInventoryClient(fetchImpl, inventoryUrl),
  };
}
