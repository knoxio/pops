/**
 * Smoke test for the hand-rolled registry pillar manifest payload (PRD-240
 * US-03; pillar formerly named `core`). Confirms the payload passes
 * `validateManifestPayload`, declares the renamed pillar identity, and
 * exposes `coreOperationalManifest` as its sole descriptor under
 * `settings.manifests` (the `ai.config` manifest now lives in and is
 * advertised by the extracted `ai` pillar — crossPlanConflict #3).
 */
import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk';

import { coreOperationalManifest } from '../../contract/settings/index.js';
import { buildRegistryManifest } from '../registry-manifest.js';

describe('buildRegistryManifest — PRD-240 US-03 settings dimension', () => {
  it('passes validateManifestPayload', () => {
    const manifest = buildRegistryManifest('0.0.1-test');
    const result = validateManifestPayload(manifest);
    expect(result.ok).toBe(true);
  });

  it('declares the renamed registry pillar identity', () => {
    const manifest = buildRegistryManifest('0.0.1-test');
    expect(manifest.pillar).toBe('registry');
    expect(manifest.contract.package).toBe('@pops/registry-contract');
    expect(manifest.contract.tag).toBe('contract-registry@v0.0.1-test');
  });

  it('declares coreOperationalManifest as its sole settings.manifests descriptor', () => {
    const manifest = buildRegistryManifest('0.0.1-test');
    expect(manifest.settings?.manifests).toEqual([coreOperationalManifest]);
  });

  it('exposes core.operational by id and no longer advertises ai.config', () => {
    const manifest = buildRegistryManifest('0.0.1-test');
    const ids = manifest.settings?.manifests.map((m) => m.id) ?? [];
    expect(ids).toContain('core.operational');
    expect(ids).not.toContain('ai.config');
  });

  describe('epic 05 / S0 — capability features', () => {
    it('declares core.redis as a capability feature with a declarative capability probe', () => {
      const manifest = buildRegistryManifest('0.0.1-test');
      expect(manifest.features).toEqual([
        {
          key: 'core.redis',
          label: 'Redis',
          description:
            'Job queues and request cache. When unavailable, the API runs in degraded mode (queues + cache disabled).',
          default: true,
          scope: 'capability',
          capability: { pillar: 'registry', key: 'redis' },
          requiresEnv: ['REDIS_HOST'],
        },
      ]);
    });

    it('carries no runtime capabilityCheck function on the serialized feature', () => {
      const manifest = buildRegistryManifest('0.0.1-test');
      const [redis] = manifest.features ?? [];
      expect(redis).not.toHaveProperty('capabilityCheck');
    });
  });

  describe('PRD-243 US-02 — backend-only pillar omits UI dimensions', () => {
    it('does not declare a nav block', () => {
      const manifest = buildRegistryManifest('0.0.1-test');
      expect(manifest.nav).toBeUndefined();
    });

    it('does not declare a pages block', () => {
      const manifest = buildRegistryManifest('0.0.1-test');
      expect(manifest.pages).toBeUndefined();
    });

    it('does not declare an assetsBaseUrl', () => {
      const manifest = buildRegistryManifest('0.0.1-test');
      expect(manifest.assetsBaseUrl).toBeUndefined();
    });
  });
});
