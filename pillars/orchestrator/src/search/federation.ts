/**
 * Federation hit source — the production {@link SearchSource} for the engine.
 *
 * POSTs the `{ query, context }` envelope to every search-capable pillar's
 * `/search` endpoint over the pillar SDK (`pillar(id).search.search(...)`, REST
 * transport) and decorates each pillar's returned hits with `domain`/`icon`/
 * `color` section metadata.
 *
 * One section per pillar: a pillar's `/search` returns a single flat ranked
 * hit list (finance concatenates its transactions/budgets/wishlist adapters
 * into one), so the federator cannot — and does not — split a pillar's hits
 * back into per-adapter sections. It decorates at pillar granularity.
 *
 * Best-effort: a pillar that is `unavailable`, errors, or returns a non-ok
 * SDK result is LOGGED and SKIPPED — federation never fails the whole search
 * because one pillar is down.
 *
 * Pillar discovery (registry-as-truth): the search-capable set is derived from
 * the LIVE registry snapshot — every registered, healthy pillar whose manifest
 * declares a non-empty `search.adapters` slot is federated, mirroring the
 * AI-tools handler's `manifest.ai.tools` projection. Adding a search-capable
 * pillar needs no orchestrator edit: it registers, advertises `search.adapters`,
 * and appears in federated search on the next discovery refresh.
 *
 * Presentation metadata (the section `icon`/`color`/`domain`) is NOT carried by
 * the manifest's `search` slot — that slot describes adapter mechanics
 * (`name`/`entityType`/`queryShape`/`procedurePath`), not section chrome. With
 * no manifest equivalent, the per-section icon/color values stay in the small
 * static {@link SEARCH_SECTION_META} table keyed by pillar id. A search-capable
 * pillar with no entry there is still federated,
 * decorated with {@link DEFAULT_SECTION_META} — membership is registry-driven,
 * only the chrome falls back.
 */
import { RegistryUnreachableError } from '@pops/pillar-sdk/discovery';
import { pillar } from '@pops/pillar-sdk/server';

import { defaultSnapshotReader, type RegistrySnapshotReader } from '../pillars/registry.js';

import type { CallResult } from '@pops/pillar-sdk/client';
import type { PillarSnapshot, PillarStatus } from '@pops/pillar-sdk/discovery';

import type { PillarSearchGroup, SearchSource } from './engine.js';
import type { Query, SearchContext, SearchHit } from './types.js';

/** Per-pillar section decoration. */
export interface PillarSearchMeta {
  /** Section domain (drives context-section detection via domain-app-mapping). */
  readonly domain: string;
  /** Lucide icon name for the section header. */
  readonly icon: string;
  /** App color token for section theming. */
  readonly color: string;
}

/**
 * Section presentation metadata. This table does NOT decide membership — that
 * is the live registry's job (a pillar whose manifest declares
 * `search.adapters`). It only supplies the section chrome (icon/color/domain)
 * the manifest's `search` slot does not express:
 *   - contacts → `contact` adapter (`Users`, blue) — the authoritative entity
 *     store (see pillars/contacts/docs/prds/entities) and the sole
 *     entities-search source; the section a contact search hit lands in.
 *   - finance → transactions/budgets/wishlist adapters, aggregated under one
 *     `/search`; decorated with the transactions descriptor (`ArrowRightLeft`,
 *     green) as the pillar-representative section.
 *   - inventory → items adapter; pillar manifest icon `package` / color
 *     `amber`.
 *
 * A search-capable pillar absent from this table (e.g. media, or a brand-new
 * pillar) is still federated, decorated with {@link DEFAULT_SECTION_META}.
 */
export const SEARCH_SECTION_META: Readonly<Record<string, PillarSearchMeta>> = {
  finance: { domain: 'finance', icon: 'ArrowRightLeft', color: 'green' },
  inventory: { domain: 'inventory', icon: 'Package', color: 'amber' },
  contacts: { domain: 'contacts', icon: 'Users', color: 'blue' },
};

/**
 * Chrome for a search-capable pillar with no {@link SEARCH_SECTION_META} entry.
 * `domain` is overridden with the pillar id by {@link sectionMetaFor} so
 * context-section detection still works for an unmapped pillar.
 */
const DEFAULT_SECTION_META: PillarSearchMeta = {
  domain: '',
  icon: 'Circle',
  color: 'gray',
};

/**
 * Resolve a pillar's section chrome: its static entry, or a default keyed to
 * the pillar id so an unmapped-but-search-capable pillar still federates.
 */
export function sectionMetaFor(pillarId: string): PillarSearchMeta {
  const mapped = SEARCH_SECTION_META[pillarId];
  if (mapped !== undefined) return mapped;
  return { ...DEFAULT_SECTION_META, domain: pillarId };
}

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
 * Minimal typed view of a search-capable pillar's `search.search` procedure for
 * the SDK proxy. It returns the raw `{ hits }` response; the SDK's
 * `PillarHandle` proxy wraps it in `Promise<CallResult<…>>`. An object-literal
 * type (not an interface) so it is assignable to the proxy's
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
   * Live registry snapshot reader. Defaults to the SDK discovery client (the
   * same `defaultSnapshotReader` the `GET /pillars` view uses). Injectable so
   * tests drive membership off a fixed snapshot with no network.
   */
  readonly snapshotReader?: RegistrySnapshotReader;
  /** Warning sink. Defaults to `console.warn` so a down pillar is observable. */
  readonly onWarn?: (message: string, detail?: unknown) => void;
}

/** One resolved, search-capable pillar plus the chrome to decorate its hits. */
export interface ResolvedSearchPillar {
  readonly id: string;
  readonly meta: PillarSearchMeta;
}

/**
 * Effective availability for federation. Mirrors the AI-tools handler's
 * `resolveStatus`: `registered=false` is authoritative (the SDK client refuses
 * to route an unregistered pillar regardless of `status`), and a missing
 * `status` on a registered pillar is treated as healthy for legacy snapshots.
 */
function resolveStatus(snapshot: PillarSnapshot): PillarStatus {
  if (!snapshot.registered) return 'unavailable';
  if (snapshot.status !== undefined) return snapshot.status;
  return 'healthy';
}

/** True iff the pillar advertises at least one search adapter in its manifest. */
function isSearchCapable(snapshot: PillarSnapshot): boolean {
  return snapshot.manifest.search.adapters.length > 0;
}

/**
 * Project the live registry snapshot to the set of search-capable pillars,
 * each decorated with its section chrome. Selection mirrors the AI-tools
 * `buildToolList` projection: registered, healthy, and advertising the
 * capability (here `search.adapters`; there `ai.tools`).
 *
 * Defensive: a single malformed snapshot row is skipped (logged), never
 * allowed to sink the whole projection — one bad manifest must not break
 * search for every other pillar.
 */
export function selectSearchPillars(
  snapshots: readonly PillarSnapshot[],
  onWarn: (message: string, detail?: unknown) => void
): readonly ResolvedSearchPillar[] {
  const resolved: ResolvedSearchPillar[] = [];

  for (const snapshot of snapshots) {
    try {
      if (resolveStatus(snapshot) !== 'healthy') continue;
      if (!isSearchCapable(snapshot)) continue;
      resolved.push({ id: snapshot.pillarId, meta: sectionMetaFor(snapshot.pillarId) });
    } catch (err) {
      onWarn('[orchestrator] skipped malformed registry entry during search projection', err);
    }
  }

  return resolved;
}

/**
 * Resolve the search-capable pillar set from the live registry, degrading to an
 * empty set when the registry read fails. An empty set is the correct degraded
 * result — federation returns no sections rather than throwing, matching the
 * AI-tools handler's "empty list, never a 500" stance.
 */
async function resolveSearchPillars(
  reader: RegistrySnapshotReader,
  onWarn: (message: string, detail?: unknown) => void
): Promise<readonly ResolvedSearchPillar[]> {
  let snapshots: readonly PillarSnapshot[];
  try {
    snapshots = await reader();
  } catch (err) {
    if (err instanceof RegistryUnreachableError) {
      onWarn('[orchestrator] registry unreachable; serving empty federated-search set', err);
    } else {
      onWarn('[orchestrator] registry read failed; serving empty federated-search set', err);
    }
    return [];
  }
  return selectSearchPillars(snapshots, onWarn);
}

/**
 * Build the federation {@link SearchSource}. On every search it re-reads the
 * live registry, projects the search-capable pillars, fans the query out to
 * each in parallel, collects + decorates their hits, and skips (logs) any
 * pillar that is unavailable, errors, or returns a non-ok result. Membership is
 * resolved per-search so a newly registered search-capable pillar is picked up
 * without restarting the orchestrator (the SDK discovery cache rate-limits the
 * actual registry traffic).
 */
export function createFederationSource(options: FederationSourceOptions = {}): SearchSource {
  const invoke = options.invoke ?? sdkSearchInvoker;
  const onWarn = options.onWarn ?? defaultWarn;
  const reader = options.snapshotReader ?? defaultSnapshotReader;

  return async (query: Query, context: SearchContext): Promise<PillarSearchGroup[]> => {
    const pillars = await resolveSearchPillars(reader, onWarn);

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
