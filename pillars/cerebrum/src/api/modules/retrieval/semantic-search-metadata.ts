/**
 * Engram metadata + cross-pillar enrichment resolver for
 * {@link SemanticSearchService}.
 *
 * Two rewires vs. the monolith:
 *
 *  1. Engram metadata is read from the cerebrum pillar's own drizzle handle
 *     (`engram_index` + `engram_scopes` live in cerebrum.db) rather than the
 *     shared pops.db.
 *  2. Cross-pillar enrichment (`transaction` / `movie` / `tv_show` /
 *     `inventory`) is fetched over REST via injected {@link PeerClients}
 *     instead of SQL joins against the peers' tables. A peer absent from
 *     `POPS_PILLARS` (its client `undefined`) → enrichment unavailable for
 *     that source type → the hit is dropped (returns `null`), matching the
 *     monolith's behaviour for an unresolvable domain row.
 *
 * The `to*Text` formatters fold the fetched fields into a single `text`
 * preview string so the assembled context window has a human-readable body for
 * cross-pillar sources (which carry no `content_preview` of their own beyond
 * the embedded chunk).
 */
import { eq } from 'drizzle-orm';

import { engramIndex, engramScopes } from '../../../db/index.js';
import { isSecretScope, type ResolvedMetadata } from './semantic-search-helpers.js';

import type { CerebrumDb } from '../../../db/index.js';
import type {
  FinanceTransactionRow,
  InventoryItemRow,
  MediaMovieRow,
  MediaTvShowRow,
  PeerClients,
} from './peer-clients.js';
import type { RetrievalFilters } from './types.js';

function joinNonEmpty(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' — ');
}

function toTransactionText(row: FinanceTransactionRow): string {
  return joinNonEmpty([
    row.description,
    row.entityName,
    row.tags?.length ? `tags: ${row.tags.join(', ')}` : null,
    row.notes,
  ]);
}

function toMovieText(row: MediaMovieRow): string {
  return joinNonEmpty([
    row.title,
    row.genres?.length ? `genres: ${row.genres.join(', ')}` : null,
    row.overview,
  ]);
}

function toTvShowText(row: MediaTvShowRow): string {
  return joinNonEmpty([
    row.name,
    row.genres?.length ? `genres: ${row.genres.join(', ')}` : null,
    row.overview,
  ]);
}

function toInventoryText(row: InventoryItemRow): string {
  return joinNonEmpty([row.itemName, row.brand, row.type, row.location]);
}

type CrossPillarResolver = (
  peers: PeerClients,
  sourceId: string
) => Promise<ResolvedMetadata | null>;

const CROSS_PILLAR_RESOLVERS: Record<string, CrossPillarResolver> = {
  transaction: async (peers, sourceId) => {
    const row = peers.finance ? await peers.finance.getTransaction(sourceId) : null;
    if (!row) return null;
    return {
      title: row.description ?? 'Transaction',
      fields: { ...row, text: toTransactionText(row) },
    };
  },
  movie: async (peers, sourceId) => {
    const row = peers.media ? await peers.media.getMovie(Number(sourceId)) : null;
    if (!row) return null;
    return { title: row.title ?? 'Movie', fields: { ...row, text: toMovieText(row) } };
  },
  tv_show: async (peers, sourceId) => {
    const row = peers.media ? await peers.media.getTvShow(Number(sourceId)) : null;
    if (!row) return null;
    return { title: row.name ?? 'TV Show', fields: { ...row, text: toTvShowText(row) } };
  },
  inventory: async (peers, sourceId) => {
    const row = peers.inventory ? await peers.inventory.getItem(sourceId) : null;
    if (!row) return null;
    return {
      title: row.itemName ?? 'Inventory item',
      fields: { ...row, text: toInventoryText(row) },
    };
  },
};

async function resolveCrossPillarMetadata(
  peers: PeerClients,
  sourceType: string,
  sourceId: string
): Promise<ResolvedMetadata | null> {
  const resolver = CROSS_PILLAR_RESOLVERS[sourceType];
  return resolver ? resolver(peers, sourceId) : null;
}

interface EngramRow {
  type: string;
  source: string;
  status: string;
  title: string;
  createdAt: string;
  modifiedAt: string;
  wordCount: number;
}

function matchesScopes(scopes: string[], scopeFilters: string[]): boolean {
  return scopes.some((s) => scopeFilters.some((f) => s === f || s.startsWith(f + '.')));
}

function passesArrayFilter(value: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(value);
}

function passesEngramFilters(row: EngramRow, scopes: string[], filters: RetrievalFilters): boolean {
  if (row.status === 'orphaned') return false;
  if (!passesArrayFilter(row.type, filters.types)) return false;
  if (!passesArrayFilter(row.status, filters.status)) return false;
  if (!filters.includeSecret && scopes.some(isSecretScope)) return false;
  if (filters.scopes?.length && !matchesScopes(scopes, filters.scopes)) return false;
  return true;
}

function resolveEngramMetadata(
  db: CerebrumDb,
  sourceId: string,
  filters: RetrievalFilters
): ResolvedMetadata | null {
  const rows = db.select().from(engramIndex).where(eq(engramIndex.id, sourceId)).all();
  const row = rows[0];
  if (!row) return null;

  const scopes = db
    .select({ scope: engramScopes.scope })
    .from(engramScopes)
    .where(eq(engramScopes.engramId, sourceId))
    .all()
    .map((s) => s.scope);

  if (!passesEngramFilters(row, scopes, filters)) return null;

  return {
    title: row.title,
    fields: {
      type: row.type,
      source: row.source,
      status: row.status,
      scopes,
      createdAt: row.createdAt,
      modifiedAt: row.modifiedAt,
      wordCount: row.wordCount,
    },
  };
}

export interface MetadataResolverDeps {
  db: CerebrumDb;
  peers: PeerClients;
}

export async function resolveMetadata(
  deps: MetadataResolverDeps,
  sourceType: string,
  sourceId: string,
  filters: RetrievalFilters
): Promise<ResolvedMetadata | null> {
  if (sourceType === 'engram') {
    return resolveEngramMetadata(deps.db, sourceId, filters);
  }
  return resolveCrossPillarMetadata(deps.peers, sourceType, sourceId);
}
