import { httpBatchLink, splitLink } from '@trpc/client';

import { TRPC_PILLARS, type TrpcPillarId } from '@pops/pillar-sdk/capabilities';

import type { Operation, TRPCLink } from '@trpc/client';

import type { AppRouter } from '@pops/api';

/**
 * tRPC URL prefix per pillar. Each pillar's API serves at its own URL so
 * nginx can do a simple prefix match (no regex on procedure paths) and so
 * the client batcher never assembles a batch URL targeting more than one
 * pillar at a time.
 *
 * The shell consumes these as Vite proxy paths in dev; nginx maps the same
 * prefixes to per-pillar upstreams in production. A future PRD (217) will
 * generate this map from the pillar registry.
 */
export const PILLAR_TRPC_URLS: Readonly<Record<TrpcPillarId, string>> = {
  core: '/trpc-core',
};

/** Legacy pops-api URL — catches every procedure that isn't pillar-prefixed. */
export const LEGACY_TRPC_URL = '/trpc';

const PILLAR_SET: ReadonlySet<string> = new Set(TRPC_PILLARS);

function isTrpcPillarId(value: string): value is TrpcPillarId {
  return PILLAR_SET.has(value);
}

/**
 * Returns the pillar id encoded in the first segment of a tRPC procedure
 * path, or `null` if the first segment is not a known pillar.
 *
 * @example
 *   pillarOfPath('finance.wishlist.list') // 'finance'
 *   pillarOfPath('health')                // null
 *   pillarOfPath('pops.health')           // null
 */
export function pillarOfPath(path: string): TrpcPillarId | null {
  const namespace = path.split('.')[0];
  if (!namespace) return null;
  return isTrpcPillarId(namespace) ? namespace : null;
}

/**
 * Factory for the per-URL terminating link. Defaults to {@link httpBatchLink}
 * with the project's standard `maxURLLength`. Tests inject a recording link
 * factory to assert routing decisions without performing real fetches.
 */
export type TerminalLinkFactory = (url: string) => TRPCLink<AppRouter>;

export interface CreateSplitLinkOptions {
  /** Map of pillar id → URL. Defaults to {@link PILLAR_TRPC_URLS}. */
  readonly pillarUrls?: Readonly<Record<TrpcPillarId, string>>;
  /** Catch-all URL for non-pillar procedures. Defaults to {@link LEGACY_TRPC_URL}. */
  readonly legacyUrl?: string;
  /**
   * Override the terminal link constructor. Default builds an
   * `httpBatchLink` with `maxURLLength: 2083` and the supplied `fetch`.
   */
  readonly linkFor?: TerminalLinkFactory;
  /** Custom `fetch` used by the default terminal link factory. */
  readonly fetch?: typeof fetch;
  /** Max batch URL length used by the default terminal link factory. */
  readonly maxURLLength?: number;
}

const DEFAULT_MAX_URL_LENGTH = 2083;

function defaultLinkFor(
  fetchImpl: typeof fetch | undefined,
  maxURLLength: number
): TerminalLinkFactory {
  return (url) =>
    httpBatchLink<AppRouter>({
      url,
      maxURLLength,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
}

/**
 * Builds a tRPC link that dispatches each operation to the per-pillar batch
 * link matching its namespace, falling back to the legacy URL for anything
 * else. tRPC's `splitLink` is binary, so the chain is nested once per pillar.
 *
 * Per-pillar links share no batch buffer: a request graph that mixes
 * `core.foo` and `finance.bar` always produces two separate HTTP calls.
 */
export function createPillarSplitLink(opts: CreateSplitLinkOptions = {}): TRPCLink<AppRouter> {
  const pillarUrls = opts.pillarUrls ?? PILLAR_TRPC_URLS;
  const legacyUrl = opts.legacyUrl ?? LEGACY_TRPC_URL;
  const linkFor =
    opts.linkFor ?? defaultLinkFor(opts.fetch, opts.maxURLLength ?? DEFAULT_MAX_URL_LENGTH);

  const legacyLink = linkFor(legacyUrl);

  return TRPC_PILLARS.reduce<TRPCLink<AppRouter>>(
    (falseBranch: TRPCLink<AppRouter>, pillar: TrpcPillarId) => {
      const pillarLink = linkFor(pillarUrls[pillar]);
      return splitLink<AppRouter>({
        condition: (op: Operation) => pillarOfPath(op.path) === pillar,
        true: pillarLink,
        false: falseBranch,
      });
    },
    legacyLink
  );
}
