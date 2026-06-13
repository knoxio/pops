import {
  HA_ENTITIES_ADAPTER_NAME,
  HA_ENTITIES_ENTITY_TYPE,
  HA_ENTITIES_PROCEDURE_PATH,
} from './search/entities-adapter.js';
import { mappings } from './sinks/mapping.js';
import { validateSinkMappings } from './sinks/validator.js';

/**
 * HA bridge pillar manifest (PRD-229).
 *
 * US-01 shipped the scaffolding — the pillar registers with the central
 * registry on boot, declares `pillar: 'ha-bridge'`, and pins its
 * contract. US-02 fills `search.adapters` with the `haEntities` adapter
 * over the FTS5 virtual table (`ha_entities_fts`). The remaining
 * dimensions land in subsequent stories:
 *
 *   - US-03 fills `ai.tools` with the read-only `ha.entity.list` and
 *     `ha.entity.getState` entries.
 *   - US-04 adds `ha.entity.callService` to `ai.tools`.
 *
 * PRD-237 US-01 derives the `sinks.descriptors` block from the mapping
 * config (`src/sinks/mapping.ts`) — the same array drives the runtime
 * `/_sinks/<eventType>` handler registry (US-02), so manifest and
 * runtime cannot drift.
 */
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export const HA_BRIDGE_PILLAR_ID = 'ha-bridge' as const;

validateSinkMappings(mappings);

export function buildHaBridgeManifest(version: string): ManifestPayload {
  return {
    pillar: HA_BRIDGE_PILLAR_ID,
    version,
    contract: {
      package: '@pops/ha-bridge-contract',
      version,
      tag: `contract-ha-bridge@v${version}`,
    },
    routes: {
      queries: [HA_ENTITIES_PROCEDURE_PATH],
      mutations: [],
      subscriptions: [],
    },
    search: {
      adapters: [
        {
          name: HA_ENTITIES_ADAPTER_NAME,
          entityType: HA_ENTITIES_ENTITY_TYPE,
          queryShape: {
            supportsText: true,
            supportsTags: false,
            supportsDateRange: false,
            supportsScope: [],
          },
          procedurePath: HA_ENTITIES_PROCEDURE_PATH,
        },
      ],
    },
    ai: { tools: [] },
    sinks: {
      descriptors: mappings.map((mapping) => ({
        eventType: mapping.eventType,
        description: mapping.description,
        schema: mapping.schema,
      })),
    },
    uri: { types: [] },
    settings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}
