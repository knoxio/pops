/**
 * Hand-rolled ai pillar manifest payload.
 *
 * Lives in its own module (not inline in `server.ts`) so tests can import the
 * builder without triggering `server.ts`'s boot side-effects (`openAiDb`,
 * `app.listen`, signal handlers).
 *
 * The ai pillar is backend-serving; its UI (`@pops/app-ai`) is loaded by the
 * shell via its `bundle-map.tsx`, so this manifest omits the optional
 * `nav`/`pages` dimensions.
 *
 * `contract.package` MUST be `@pops/ai` — the collapsed-pillar form the manifest
 * validator requires for pillar id `ai`, matching the npm package name.
 */
import { aiConfigManifest } from '../contract/settings/ai-manifest.js';

import type { CapabilityReporter } from '@pops/pillar-sdk/bootstrap';
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

/**
 * Runtime capability heartbeat for ai. Advertises `settings: true` so the
 * shell's live-registry settings discovery routes ai's settings reads and
 * writes to ai's own federated `/settings/*` surface (capability-gated) rather
 * than falling back to the registry pillar.
 */
export function buildAiCapabilityReporter(): CapabilityReporter {
  return () => ({ settings: true });
}

export function buildAiManifest(version: string): ManifestPayload {
  return {
    pillar: 'ai',
    version,
    contract: {
      package: '@pops/ai',
      version,
      tag: `contract-ai@v${version}`,
    },
    routes: {
      queries: [
        'ai.usage.getStats',
        'ai.usage.getHistory',
        'ai.observability.getStats',
        'ai.observability.getHistory',
        'ai.observability.getLatencyStats',
        'ai.observability.getQualityMetrics',
        'ai.providers.list',
        'ai.providers.get',
        'ai.providers.healthCheck',
        'ai.budgets.list',
        'ai.budgets.getBudgetStatus',
        'ai.alerts.listRules',
        'ai.alerts.getRule',
        'ai.alerts.list',
        'ai.pricing.lookup',
      ],
      mutations: [
        'ai.ingest.record',
        'ai.providers.upsert',
        'ai.budgets.upsert',
        'ai.alerts.createRule',
        'ai.alerts.updateRule',
        'ai.alerts.deleteRule',
        'ai.alerts.setRuleEnabled',
        'ai.alerts.seedDefaultRules',
        'ai.alerts.acknowledge',
        'ai.alerts.runNow',
      ],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: { manifests: [aiConfigManifest] },
    healthcheck: { path: '/health' },
  };
}
