/**
 * HA bridge search adapter (PRD-229 US-02).
 *
 * Glue between the federation orchestrator's `FederatedSearchQuery`
 * (PRD-196 / PRD-197) and the `searchEntities` FTS5 service in
 * `@pops/ha-bridge-db`. The adapter is intentionally thin: it forwards
 * `query.text` to FTS5, maps each hit to a `ScoredResult`, and lets the
 * orchestrator handle per-pillar normalisation and weighting.
 *
 * Empty / missing text resolves to `[]` — the HA bridge's only supported
 * `queryShape` dimension is `supportsText`, so a tag-only or
 * date-range-only federation query has nothing to answer.
 */
import { searchEntities, type HaBridgeDb } from '@pops/ha-bridge-db';

import type { ScoredResult } from '@pops/pillar-sdk/ranking';

export const HA_ENTITIES_ADAPTER_NAME = 'haEntities' as const;
export const HA_ENTITIES_ENTITY_TYPE = 'ha-entity' as const;
export const HA_ENTITIES_PROCEDURE_PATH = 'habridge.entities.search' as const;

/**
 * Data payload attached to each `ScoredResult`. Mirrors PRD-229 § US-02:
 * `id`, `label`, plus metadata `{ domain, area, deviceClass, state }`,
 * extended with `snippet` so the search surface can highlight matches
 * without a second fetch.
 */
export interface HaEntityHitData {
  id: string;
  label: string;
  domain: string;
  area: string | null;
  deviceClass: string | null;
  state: string;
  snippet: string;
}

export interface HaEntitiesSearchInput {
  text?: string;
  limit?: number;
}

/**
 * Run the adapter against the bridge's DB handle. Returned in
 * orchestrator-native shape (`ScoredResult[]`) so a future tRPC procedure
 * wrapper is a 1:1 forward — no shape translation needed.
 */
export function runHaEntitiesSearch(db: HaBridgeDb, input: HaEntitiesSearchInput): ScoredResult[] {
  const text = input.text?.trim() ?? '';
  if (text.length === 0) return [];

  const hits = searchEntities(db, text, { limit: input.limit });
  return hits.map((hit): ScoredResult => {
    const label = hit.friendlyName ?? hit.entityId;
    const data: HaEntityHitData = {
      id: hit.entityId,
      label,
      domain: hit.domain,
      area: hit.area,
      deviceClass: hit.deviceClass,
      state: hit.state,
      snippet: hit.snippet,
    };
    return {
      score: hit.score,
      entityName: label,
      data,
    };
  });
}
