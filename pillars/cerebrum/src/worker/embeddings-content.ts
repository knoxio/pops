/**
 * Content resolution for the embeddings worker.
 *
 * Maps a `{ sourceType, sourceId }` to the embeddable text for that record.
 * `engram` resolves from the pillar's filesystem-backed {@link EngramService};
 * the cross-pillar types resolve over REST via the retrieval peer clients'
 * by-id getters, formatted with the same text builders the thalamus
 * cross-source indexer hashes against. An absent peer, an unknown type, or a
 * 404 yields `null` so the handler skips rather than crashes.
 */
import { EngramService } from '../api/modules/engrams/service.js';
import {
  toInventoryText,
  toMovieText,
  toTransactionText,
  toTvShowText,
} from '../api/modules/thalamus/cross-source.js';

import type { PeerClients } from '../api/modules/retrieval/peer-clients.js';
import type { TemplateRegistry } from '../api/modules/templates/registry.js';
import type { CerebrumDb } from '../db/index.js';

export interface ContentResolutionDeps {
  db: CerebrumDb;
  engramRoot: string;
  templates: TemplateRegistry;
  peers: PeerClients;
}

/**
 * Resolve the embeddable text for a source, or `null` when it is unknown /
 * unavailable / missing.
 */
export async function resolveContent(
  deps: ContentResolutionDeps,
  sourceType: string,
  sourceId: string
): Promise<string | null> {
  switch (sourceType) {
    case 'engram':
      return resolveEngramContent(deps, sourceId);
    case 'transaction':
      return resolveTransactionContent(deps.peers, sourceId);
    case 'movie':
      return resolveMovieContent(deps.peers, sourceId);
    case 'tv_show':
      return resolveTvShowContent(deps.peers, sourceId);
    case 'inventory':
      return resolveInventoryContent(deps.peers, sourceId);
    default:
      return null;
  }
}

function resolveEngramContent(deps: ContentResolutionDeps, engramId: string): string | null {
  const service = new EngramService({
    root: deps.engramRoot,
    db: deps.db,
    templates: deps.templates,
  });
  try {
    const { engram, body } = service.read(engramId);
    return [engram.title, body].filter(Boolean).join('\n');
  } catch {
    return null;
  }
}

async function resolveTransactionContent(peers: PeerClients, id: string): Promise<string | null> {
  const row = await peers.finance?.getTransaction(id);
  if (row === undefined || row === null) return null;
  return toTransactionText({ ...row, id });
}

async function resolveMovieContent(peers: PeerClients, id: string): Promise<string | null> {
  const numericId = Number.parseInt(id, 10);
  if (!Number.isInteger(numericId)) return null;
  const row = await peers.media?.getMovie(numericId);
  if (row === undefined || row === null) return null;
  return toMovieText({ ...row, id: numericId });
}

async function resolveTvShowContent(peers: PeerClients, id: string): Promise<string | null> {
  const numericId = Number.parseInt(id, 10);
  if (!Number.isInteger(numericId)) return null;
  const row = await peers.media?.getTvShow(numericId);
  if (row === undefined || row === null) return null;
  return toTvShowText({ ...row, id: numericId });
}

async function resolveInventoryContent(peers: PeerClients, id: string): Promise<string | null> {
  const row = await peers.inventory?.getItem(id);
  if (row === undefined || row === null) return null;
  return toInventoryText({ ...row, id });
}
