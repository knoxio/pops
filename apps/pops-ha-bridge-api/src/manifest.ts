/**
 * HA bridge pillar manifest (PRD-229).
 *
 * US-01 ships the scaffolding — the pillar registers with the central
 * registry on boot, declares `pillar: 'ha-bridge'`, and pins its
 * contract. The new manifest dimensions PRD-229 introduces
 * (`searchAdapter` / `aiTools` / `sinks`) land in subsequent stories:
 *
 *   - US-02 fills `search.adapters` with `ha-entities` over the FTS5
 *     virtual table.
 *   - US-03 fills `ai.tools` with the read-only `ha.entity.list` and
 *     `ha.entity.getState` entries.
 *   - US-04 adds `ha.entity.callService` to `ai.tools`.
 *   - US-05 fills `sinks.descriptors` with `ha.notify` + `ha.event.fire`.
 *
 * Until those stories land, every dimension is empty — but the manifest
 * is still validated by `bootstrapPillar`, so the schema gates on this
 * shape now.
 */
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export const HA_BRIDGE_PILLAR_ID = 'ha-bridge' as const;

export function buildHaBridgeManifest(version: string): ManifestPayload {
  return {
    pillar: HA_BRIDGE_PILLAR_ID,
    version,
    contract: {
      package: '@pops/ha-bridge-contract',
      version,
      tag: `contract-ha-bridge@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    sinks: { descriptors: [] },
    uri: { types: [] },
    settings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}
