import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildOrchestratorManifest } from '../manifest.js';

describe('buildOrchestratorManifest', () => {
  it('produces a manifest that passes registry validation (schema + cross-field)', () => {
    const result = validateManifestPayload(buildOrchestratorManifest('1.2.3'));

    expect(result.ok).toBe(true);
  });

  it('registers under the orchestrator pillar id with a matching collapsed contract package', () => {
    const manifest = buildOrchestratorManifest('1.2.3');

    expect(manifest.pillar).toBe('orchestrator');
    expect(manifest.contract.package).toBe('@pops/orchestrator');
    expect(manifest.contract.tag).toBe('contract-orchestrator@v1.2.3');
  });

  it('declares an empty cross-pillar surface in this increment (search/ai/uri/routes)', () => {
    const manifest = buildOrchestratorManifest('1.2.3');

    expect(manifest.search.adapters).toEqual([]);
    expect(manifest.ai.tools).toEqual([]);
    expect(manifest.uri.types).toEqual([]);
    expect(manifest.routes.queries).toEqual([]);
    expect(manifest.routes.mutations).toEqual([]);
  });
});
