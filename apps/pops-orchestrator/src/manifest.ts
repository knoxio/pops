/**
 * Orchestrator manifest payload builder.
 *
 * Declares the wire-format manifest the orchestrator registers with the
 * central registry on boot (opt-in via `POPS_REGISTRY_ENABLED`). The
 * orchestrator is a cross-pillar aggregator that owns no domain DB: its
 * registration is intentionally empty across `routes`, `search`, `ai`, and
 * `uri` in this increment (precursor C2 / ADR-029, epics 06+07). The
 * federated search adapters (epic 06) and AI-tool registry (epic 07) land
 * in follow-up increments and will populate those dimensions then.
 */
import { ORCHESTRATOR_PILLAR_ID } from './pillars/registry.js';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export function buildOrchestratorManifest(version: string): ManifestPayload {
  return {
    pillar: ORCHESTRATOR_PILLAR_ID,
    version,
    contract: {
      package: '@pops/orchestrator',
      version,
      tag: `contract-orchestrator@v${version}`,
    },
    routes: {
      queries: [],
      mutations: [],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}
