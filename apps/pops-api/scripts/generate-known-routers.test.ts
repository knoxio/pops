import { describe, expect, it } from 'vitest';

import { collectModuleEntries, renderKnownRoutersSource } from './generate-known-routers.js';

describe('generate-known-routers', () => {
  it('emits keys that match the hand-curated KNOWN_ROUTERS literal in router.ts', async () => {
    const { KNOWN_ROUTERS_GENERATED } = await import('../src/generated/known-routers.js');
    const generatedIds = Object.keys(KNOWN_ROUTERS_GENERATED).toSorted();
    const handCuratedIds = ['core', 'finance', 'food', 'inventory', 'lists', 'media'].toSorted();
    expect(generatedIds).toEqual(handCuratedIds);
  });

  it('tolerates contract packages without a ./router export by skipping them', () => {
    const entries = collectModuleEntries([
      {
        pillar: 'phantom',
        dir: '/fake',
        hasRouterExport: false,
        subPillars: [],
      },
      {
        pillar: 'real',
        dir: '/real',
        hasRouterExport: true,
        subPillars: [],
      },
    ]);
    expect(entries.map((e) => e.id)).toEqual(['real']);
  });

  it('sorts entries deterministically by id regardless of input order', () => {
    const entries = collectModuleEntries([
      { pillar: 'zeta', dir: '/z', hasRouterExport: true, subPillars: [] },
      {
        pillar: 'cerebrum',
        dir: '/c',
        hasRouterExport: true,
        subPillars: ['cerebrum', 'ego'],
      },
      { pillar: 'alpha', dir: '/a', hasRouterExport: true, subPillars: [] },
    ]);
    const ids = entries.map((e) => e.id);
    expect(ids).toEqual(['alpha', 'cerebrum', 'ego', 'zeta']);
    expect(renderKnownRoutersSource(entries)).toContain(
      "import { egoRouter } from '../modules/cerebrum/ego/index.js';"
    );
  });
});
