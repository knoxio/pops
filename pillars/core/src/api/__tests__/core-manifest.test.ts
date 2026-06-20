/**
 * Smoke test for the hand-rolled core pillar manifest payload (PRD-240
 * US-03). Confirms the payload passes `validateManifestPayload` and
 * exposes both `aiConfigManifest` + `coreOperationalManifest` as
 * descriptors under `settings.manifests`.
 */
import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk';

import { aiConfigManifest, coreOperationalManifest } from '../../contract/settings/index.js';
import { buildCoreManifest } from '../core-manifest.js';

describe('buildCoreManifest — PRD-240 US-03 settings dimension', () => {
  it('passes validateManifestPayload', () => {
    const manifest = buildCoreManifest('0.0.1-test');
    const result = validateManifestPayload(manifest);
    expect(result.ok).toBe(true);
  });

  it('declares aiConfigManifest + coreOperationalManifest under settings.manifests', () => {
    const manifest = buildCoreManifest('0.0.1-test');
    expect(manifest.settings?.manifests).toEqual([aiConfigManifest, coreOperationalManifest]);
  });

  it('exposes both descriptors by id', () => {
    const manifest = buildCoreManifest('0.0.1-test');
    const ids = manifest.settings?.manifests.map((m) => m.id) ?? [];
    expect(ids).toContain('ai.config');
    expect(ids).toContain('core.operational');
  });

  describe('epic 05 / S0 — capability features', () => {
    it('declares core.redis as a capability feature with a declarative capability probe', () => {
      const manifest = buildCoreManifest('0.0.1-test');
      expect(manifest.features).toEqual([
        {
          key: 'core.redis',
          label: 'Redis',
          description:
            'Job queues and request cache. When unavailable, the API runs in degraded mode (queues + cache disabled).',
          default: true,
          scope: 'capability',
          capability: { pillar: 'core', key: 'redis' },
          requiresEnv: ['REDIS_HOST'],
        },
      ]);
    });

    it('carries no runtime capabilityCheck function on the serialized feature', () => {
      const manifest = buildCoreManifest('0.0.1-test');
      const [redis] = manifest.features ?? [];
      expect(redis).not.toHaveProperty('capabilityCheck');
    });
  });

  describe('PRD-243 US-02 — backend-only pillar omits UI dimensions', () => {
    it('does not declare a nav block', () => {
      const manifest = buildCoreManifest('0.0.1-test');
      expect(manifest.nav).toBeUndefined();
    });

    it('does not declare a pages block', () => {
      const manifest = buildCoreManifest('0.0.1-test');
      expect(manifest.pages).toBeUndefined();
    });

    it('does not declare an assetsBaseUrl', () => {
      const manifest = buildCoreManifest('0.0.1-test');
      expect(manifest.assetsBaseUrl).toBeUndefined();
    });
  });
});
