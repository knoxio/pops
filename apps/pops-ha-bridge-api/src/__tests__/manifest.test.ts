import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { ENTITY_LIST_TOOL_NAME } from '../ai-tools/index.js';
import { buildHaBridgeManifest, HA_BRIDGE_PILLAR_ID } from '../manifest.js';
import {
  HA_ENTITIES_ADAPTER_NAME,
  HA_ENTITIES_ENTITY_TYPE,
  HA_ENTITIES_PROCEDURE_PATH,
} from '../search/entities-adapter.js';

describe('buildHaBridgeManifest', () => {
  it('produces a payload that passes the central manifest schema', () => {
    const manifest = buildHaBridgeManifest('0.1.0');
    const parsed = ManifestPayloadSchema.parse(manifest);
    expect(parsed.pillar).toBe(HA_BRIDGE_PILLAR_ID);
    expect(parsed.contract.tag).toBe('contract-ha-bridge@v0.1.0');
    expect(parsed.ai.tools.map((t) => t.name)).toEqual([ENTITY_LIST_TOOL_NAME]);
    expect(parsed.sinks?.descriptors.length).toBeGreaterThan(0);
  });

  it('publishes the entityList AI tool descriptor (US-03 partial)', () => {
    const manifest = buildHaBridgeManifest('0.1.0');
    const tool = manifest.ai.tools.find((t) => t.name === ENTITY_LIST_TOOL_NAME);
    if (tool === undefined) throw new Error('entityList descriptor missing');
    expect(tool.description.length).toBeGreaterThanOrEqual(10);
    expect(tool.parameters).toMatchObject({ type: 'object' });
    const parameters = tool.parameters as { properties?: Record<string, unknown> };
    const props = parameters.properties ?? {};
    expect(Object.keys(props).toSorted()).toEqual(['area', 'cursor', 'domain', 'limit']);
  });

  it('declares the haEntities search adapter (US-02)', () => {
    const manifest = buildHaBridgeManifest('0.1.0');
    expect(manifest.search.adapters).toHaveLength(1);
    const adapter = manifest.search.adapters[0];
    expect(adapter?.name).toBe(HA_ENTITIES_ADAPTER_NAME);
    expect(adapter?.entityType).toBe(HA_ENTITIES_ENTITY_TYPE);
    expect(adapter?.procedurePath).toBe(HA_ENTITIES_PROCEDURE_PATH);
    expect(adapter?.queryShape).toEqual({
      supportsText: true,
      supportsTags: false,
      supportsDateRange: false,
      supportsScope: [],
    });
  });

  it('passes cross-field validation — search adapter procedurePath is declared in routes.queries', () => {
    const manifest = buildHaBridgeManifest('0.1.0');
    const result = validateManifestPayload(manifest);
    expect(result.ok).toBe(true);
  });

  it('rejects non-semver versions at the schema boundary', () => {
    const manifest = buildHaBridgeManifest('not-a-semver');
    expect(() => ManifestPayloadSchema.parse(manifest)).toThrow();
  });
});
