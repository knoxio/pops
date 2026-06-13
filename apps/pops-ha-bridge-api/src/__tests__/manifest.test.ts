import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema } from '@pops/pillar-sdk/manifest-schema';

import { buildHaBridgeManifest, HA_BRIDGE_PILLAR_ID } from '../manifest.js';

describe('buildHaBridgeManifest', () => {
  it('produces a payload that passes the central manifest schema', () => {
    const manifest = buildHaBridgeManifest('0.1.0');
    const parsed = ManifestPayloadSchema.parse(manifest);
    expect(parsed.pillar).toBe(HA_BRIDGE_PILLAR_ID);
    expect(parsed.contract.tag).toBe('contract-ha-bridge@v0.1.0');
    expect(parsed.search.adapters).toEqual([]);
    expect(parsed.ai.tools).toEqual([]);
    expect(parsed.sinks?.descriptors).toEqual([]);
  });

  it('rejects non-semver versions at the schema boundary', () => {
    const manifest = buildHaBridgeManifest('not-a-semver');
    expect(() => ManifestPayloadSchema.parse(manifest)).toThrow();
  });
});
