/**
 * Manifest contract test — confirms the cerebrum pillar manifest payload
 * validates against `ManifestPayloadSchema` and surfaces the cerebrum + ego
 * settings contributions. The `nav`/`pages` UI dimensions are deferred to the
 * FE-rewire slice (Phase D), so they are intentionally absent here.
 */
import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { cerebrumManifest, egoManifest } from '../../contract/settings/index.js';
import { buildCerebrumCapabilityReporter, buildCerebrumManifest } from '../manifest.js';

describe('buildCerebrumManifest', () => {
  it('produces a payload that validates against ManifestPayloadSchema', () => {
    const payload = buildCerebrumManifest('1.2.3');
    const result = ManifestPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('declares the cerebrum + ego settings manifests under settings.manifests', () => {
    const payload = buildCerebrumManifest('1.2.3');
    expect(payload.settings).toEqual({ manifests: [cerebrumManifest, egoManifest] });
  });

  it('threads the version through the contract block', () => {
    const payload = buildCerebrumManifest('4.5.6');
    expect(payload.contract).toEqual({
      package: '@pops/cerebrum',
      version: '4.5.6',
      tag: 'contract-cerebrum@v4.5.6',
    });
  });

  it('omits nav/pages until the FE rewire (Phase D)', () => {
    const payload = buildCerebrumManifest('1.2.3');
    expect(payload.nav).toBeUndefined();
    expect(payload.pages).toBeUndefined();
  });

  it('declares cerebrum.vectorSearch as a capability feature (epic 05 / S0)', () => {
    const payload = buildCerebrumManifest('1.2.3');
    expect(payload.features).toEqual([
      {
        key: 'cerebrum.vectorSearch',
        label: 'Vector search (sqlite-vec)',
        description:
          'Semantic and hybrid retrieval. Disabled when the sqlite-vec extension fails to load at startup.',
        default: true,
        scope: 'capability',
        capability: { pillar: 'cerebrum', key: 'vectorSearch' },
      },
    ]);
  });

  it('passes wire-shaped validation', () => {
    const payload = buildCerebrumManifest('1.2.3');
    const result = validateManifestPayload(payload);
    expect(result.ok).toBe(true);
  });
});

describe('buildCerebrumCapabilityReporter (P2 settings federation)', () => {
  it('reports settings: true so the shell routes settings to cerebrum', () => {
    expect(buildCerebrumCapabilityReporter(true)()['settings']).toBe(true);
  });

  it('preserves the live vectorSearch status alongside settings', () => {
    expect(buildCerebrumCapabilityReporter(true)()).toEqual({
      vectorSearch: true,
      settings: true,
    });
    expect(buildCerebrumCapabilityReporter(false)()).toEqual({
      vectorSearch: false,
      settings: true,
    });
  });
});
