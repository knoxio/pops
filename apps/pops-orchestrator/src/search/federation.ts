/**
 * Federation hit source — the production {@link SearchSource} for the engine.
 *
 * Replaces the monolith's in-process adapter registry: instead of calling each
 * `adapter.search(query, context)` in-process, it POSTs the same
 * `{ query, context }` envelope to every search-capable pillar's `/search`
 * endpoint over the pillar SDK (`pillar(id).search.search(...)`, REST
 * transport) and decorates each pillar's returned hits with the
 * `domain`/`icon`/`color` metadata the monolith's per-adapter descriptors
 * carried (`apps/pops-api/src/modules/search-adapters.ts` + each module's
 * `search-adapter.ts`).
 *
 * One section per pillar: a pillar's `/search` returns a single flat ranked
 * hit list (finance concatenates its transactions/budgets/wishlist adapters
 * into one), so the federator cannot — and does not — split a pillar's hits
 * back into per-adapter sections. It decorates at pillar granularity.
 *
 * Best-effort: a pillar that is `unavailable`, errors, or returns a non-ok
 * SDK result is LOGGED and SKIPPED — federation never fails the whole search
 * because one pillar is down (epic 06).
 *
 * Pillar discovery: the search-capable set is a typed constant
 * ({@link SEARCH_PILLARS}) intersected with the pillars actually present in
 * `POPS_PILLARS`. The registry/manifest does advertise search capability
 * (`manifest.search.adapters`), but the orchestrator's `POPS_PILLARS` registry
 * view (`pillars/registry.ts`) carries only `{ id, baseUrl }` — not manifests
 * — so capability cannot be read from it cleanly. The constant list is the
 * deliberate, typed alternative; see the increment report.
 */
import { pillar } from '@pops/pillar-sdk/server';

import { getPillarRegistry } from '../pillars/registry.js';

import type { CallResult } from '@pops/pillar-sdk/client';

import type { PillarSearchGroup, SearchSource } from './engine.js';
import type { Query, SearchContext, SearchHit } from './types.js';

/** Per-pillar section decoration, ported from the monolith adapter descriptors. */
export interface PillarSearchMeta {
  /** Section domain (drives context-section detection via domain-app-mapping). */
  readonly domain: string;
  /** Lucide icon name for the section header. */
  readonly icon: string;
  /** App color token for section theming. */
  readonly color: string;
}

/**
 * The pillars that serve `POST /search` and the section metadata the
 * federator decorates their hits with. Ported from the monolith:
 *   - core  → `entities` adapter (`Building2`, green)
 *   - finance → transactions/budgets/wishlist adapters, aggregated under one
 *     `/search`; decorated with the transactions descriptor (`ArrowRightLeft`,
 *     green) as the pillar-representative section.
 *   - inventory → items adapter; pillar manifest icon `package` / color
 *     `amber`.
 *
 * Media also serves `/search` but is out of scope for this increment (core /
 * finance / inventory only).
 */
export const SEARCH_PILLARS: Readonly<Record<string, PillarSearchMeta>> = {
  core: { domain: 'core', icon: 'Building2', color: 'green' },
  finance: { domain: 'finance', icon: 'ArrowRightLeft', color: 'green' },
  inventory: { domain: 'inventory', icon: 'Package', color: 'amber' },
};

/** Wire shape returned by a pillar's `search.search` procedure. */
export interface PillarSearchResponse {
  hits: SearchHit[];
}

/**
 * Dispatches the `search.search` call to one pillar. Injectable so the federation
 * source can be tested without network or service-account auth — production
 * uses {@link sdkSearchInvoker}, which goes over the pillar SDK (REST).
 */
export type SearchInvoker = (
  pillarId: string,
  body: { query: Query; context?: SearchContext }
) => Promise<CallResult<PillarSearchResponse>>;

/**
 * Minimal typed view of a search-capable pillar's contract router for the
 * SDK proxy. `search.search` returns the raw `{ hits }` response; the SDK's
 * `PillarHandle` proxy wraps it in `Promise<CallResult<…>>`. Modelled on the
 * `CerebrumEmbeddingsShape` pattern in the monolith embeddings client — an
 * object-literal type (not an interface) so it is assignable to the proxy's
 * `Record<string, unknown>` constraint.
 */
type PillarSearchRouter = {
  search: {
    search: (input: { query: Query; context?: SearchContext }) => PillarSearchResponse;
  };
};

/** Production invoker: `pillar(id).search.search({ query, context })` over the SDK. */
export const sdkSearchInvoker: SearchInvoker = (pillarId, body) =>
  pillar<PillarSearchRouter>(pillarId).search.search(body);

export interface FederationSourceOptions {
  /** Search dispatcher. Defaults to {@link sdkSearchInvoker}. */
  readonly invoke?: SearchInvoker;
  /**
   * Search-capable pillars present in this deploy. Defaults to the constant
   * {@link SEARCH_PILLARS} intersected with `POPS_PILLARS` via
   * {@link resolveSearchPillars}.
   */
  readonly pillars?: readonly { id: string; meta: PillarSearchMeta }[];
  /** Warning sink. Defaults to `console.warn` so a down pillar is observable. */
  readonly onWarn?: (message: string, detail?: unknown) => void;
  /** Self base URL for the registry view. Defaults to the unused localhost placeholder. */
  readonly selfBaseUrl?: string;
}

/**
 * Intersect the search-capable constant with the pillars actually present in
 * `POPS_PILLARS`. A search-capable pillar absent from the registry is silently
 * skipped (it is not deployed); a registry pillar with no search capability
 * (e.g. `food`) is ignored.
 */
export function resolveSearchPillars(
  selfBaseUrl: string
): readonly { id: string; meta: PillarSearchMeta }[] {
  const registered = new Set(getPillarRegistry({ selfBaseUrl }).map((p) => p.id));
  const resolved: { id: string; meta: PillarSearchMeta }[] = [];
  for (const [id, meta] of Object.entries(SEARCH_PILLARS)) {
    if (registered.has(id)) resolved.push({ id, meta });
  }
  return resolved;
}

/** Localhost placeholder — the registry view requires a self base URL but the federator never calls itself. */
const REGISTRY_SELF_PLACEHOLDER = 'http://localhost';

/**
 * Build the federation {@link SearchSource}. Fans the query out to every
 * resolved search-capable pillar in parallel; collects each pillar's hits and
 * decorates them; skips (logs) any pillar that is unavailable, errors, or
 * returns a non-ok result.
 */
export function createFederationSource(options: FederationSourceOptions = {}): SearchSource {
  const invoke = options.invoke ?? sdkSearchInvoker;
  const onWarn = options.onWarn ?? defaultWarn;
  const selfBaseUrl = options.selfBaseUrl ?? REGISTRY_SELF_PLACEHOLDER;
  const pillars = options.pillars ?? resolveSearchPillars(selfBaseUrl);

  return async (query: Query, context: SearchContext): Promise<PillarSearchGroup[]> => {
    const settled = await Promise.allSettled(
      pillars.map(async ({ id, meta }) => {
        const result = await invoke(id, { query, context });
        return { id, meta, result };
      })
    );

    const groups: PillarSearchGroup[] = [];

    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        onWarn('[orchestrator] federated search pillar threw', outcome.reason);
        continue;
      }

      const { id, meta, result } = outcome.value;
      if (result.kind !== 'ok') {
        onWarn(`[orchestrator] federated search pillar '${id}' ${result.kind}`, result);
        continue;
      }

      groups.push({
        domain: meta.domain,
        moduleId: id,
        icon: meta.icon,
        color: meta.color,
        hits: result.value.hits,
      });
    }

    return groups;
  };
}

function defaultWarn(message: string, detail?: unknown): void {
  if (detail === undefined) console.warn(message);
  else console.warn(message, detail);
}
