import { describe, expect, it } from 'vitest';

import { cerebrumManifest, egoManifest } from '@pops/cerebrum-contract/settings';
import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildCerebrumManifest, CEREBRUM_PILLAR_ID } from '../manifest.js';

describe('buildCerebrumManifest', () => {
  it('produces a payload that passes the central manifest schema', () => {
    const manifest = buildCerebrumManifest('0.1.0');
    const parsed = ManifestPayloadSchema.parse(manifest);
    expect(parsed.pillar).toBe(CEREBRUM_PILLAR_ID);
    expect(parsed.contract.package).toBe('@pops/cerebrum-contract');
    expect(parsed.contract.tag).toBe('contract-cerebrum@v0.1.0');
  });

  it('passes the full cross-field validator', () => {
    const result = validateManifestPayload(buildCerebrumManifest('0.1.0'));
    expect(result.ok).toBe(true);
  });

  it('declares both cerebrum and ego settings manifests on the settings dimension (PRD-240 US-03)', () => {
    const manifest = buildCerebrumManifest('0.1.0');
    expect(manifest.settings?.manifests.map((m) => m.id)).toEqual([
      cerebrumManifest.id,
      egoManifest.id,
    ]);
  });

  it('forwards the cerebrum and ego descriptors verbatim from the contract package', () => {
    const manifest = buildCerebrumManifest('0.1.0');
    const [cerebrumDescriptor, egoDescriptor] = manifest.settings?.manifests ?? [];
    expect(cerebrumDescriptor).toEqual(cerebrumManifest);
    expect(egoDescriptor).toEqual(egoManifest);
  });

  it('the two declared settings manifests carry distinct ids', () => {
    const manifest = buildCerebrumManifest('0.1.0');
    const ids = manifest.settings?.manifests.map((m) => m.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('serialises through JSON without losing the settings dimension', () => {
    const manifest = buildCerebrumManifest('0.1.0');
    const roundTripped: unknown = JSON.parse(JSON.stringify(manifest));
    const parsed = ManifestPayloadSchema.parse(roundTripped);
    expect(parsed.settings?.manifests).toHaveLength(2);
  });

  it('rejects non-semver versions at the schema boundary', () => {
    expect(() => ManifestPayloadSchema.parse(buildCerebrumManifest('not-a-semver'))).toThrow();
  });
});
