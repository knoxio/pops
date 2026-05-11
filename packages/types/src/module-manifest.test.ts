/**
 * Runtime structural validation tests for `assertModuleManifest`. Each
 * cross-cutting slot added in PRD-101 US-01 has at least one passing case
 * and one failing case; the failing case asserts the error message names the
 * offending field so the registry build (US-02) can surface it.
 */
import { describe, expect, it } from 'vitest';

import { assertModuleManifest } from './module-manifest.js';

import type { ModuleManifest } from './module-manifest.js';

const baseManifest = (): ModuleManifest => ({
  id: 'finance',
  name: 'Finance',
  surfaces: ['app'],
});

describe('assertModuleManifest — base contract', () => {
  it('accepts a minimal manifest', () => {
    expect(() => assertModuleManifest(baseManifest())).not.toThrow();
  });

  it('rejects non-objects', () => {
    expect(() => assertModuleManifest(null)).toThrow(/expected an object/);
    expect(() => assertModuleManifest(42)).toThrow(/expected an object/);
    expect(() => assertModuleManifest([])).toThrow(/expected an object/);
  });

  it('rejects empty id / name', () => {
    expect(() => assertModuleManifest({ ...baseManifest(), id: '' })).toThrow(/'id'/);
    expect(() => assertModuleManifest({ ...baseManifest(), name: '' })).toThrow(/'name'/);
  });

  it('rejects empty / invalid surfaces', () => {
    expect(() => assertModuleManifest({ ...baseManifest(), surfaces: [] })).toThrow(/surfaces/);
    expect(() =>
      assertModuleManifest({ ...baseManifest(), surfaces: ['nope'] as unknown as string[] })
    ).toThrow(/invalid surface/);
  });

  it('embeds the supplied context in the error', () => {
    expect(() => assertModuleManifest({}, 'modules.finance')).toThrow(/^modules\.finance:/);
  });
});

describe('assertModuleManifest — capabilities slot', () => {
  it('accepts a capability namespaced under the module id', () => {
    expect(() =>
      assertModuleManifest({ ...baseManifest(), capabilities: ['finance.transaction.read'] })
    ).not.toThrow();
  });

  it('rejects a non-array', () => {
    expect(() =>
      assertModuleManifest({ ...baseManifest(), capabilities: 'finance.x' as unknown as string[] })
    ).toThrow(/'capabilities'/);
  });

  it('rejects a non-namespaced capability', () => {
    expect(() => assertModuleManifest({ ...baseManifest(), capabilities: ['finance'] })).toThrow(
      /capabilities\[0\]/
    );
  });

  it('rejects a capability namespaced under a different module id', () => {
    expect(() =>
      assertModuleManifest({ ...baseManifest(), capabilities: ['media.movie.read'] })
    ).toThrow(/capabilities\[0\].*finance/);
  });
});

describe('assertModuleManifest — features slot', () => {
  it('accepts a well-formed features manifest list', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        features: [{ id: 'finance', title: 'Finance', order: 10, features: [] }],
      })
    ).not.toThrow();
  });

  it('rejects a non-array', () => {
    expect(() =>
      assertModuleManifest({ ...baseManifest(), features: {} as unknown as never })
    ).toThrow(/'features'/);
  });

  it('reports the failing index and field', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        features: [{ id: '', title: 'X', order: 1, features: [] }] as unknown as never,
      })
    ).toThrow(/features\[0\]\.id/);
  });

  it('requires a numeric order', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        features: [
          { id: 'finance', title: 'Finance', order: 'first', features: [] },
        ] as unknown as never,
      })
    ).toThrow(/features\[0\]\.order/);
  });
});

describe('assertModuleManifest — search slot', () => {
  it('accepts a well-formed search adapter descriptor', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        search: [{ domain: 'finance', icon: 'wallet', color: 'green', search: () => [] }],
      })
    ).not.toThrow();
  });

  it('rejects a missing search function', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        search: [{ domain: 'finance', icon: 'wallet', color: 'green' }] as unknown as never,
      })
    ).toThrow(/search\[0\]\.search/);
  });
});

describe('assertModuleManifest — uriHandler slot', () => {
  it('accepts a well-formed handler', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        uriHandler: {
          types: ['transaction'],
          resolve: async () => ({ kind: 'not-found' }),
        },
      })
    ).not.toThrow();
  });

  it('requires a non-empty types array', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        uriHandler: {
          types: [],
          resolve: async () => ({ kind: 'not-found' }),
        } as unknown as never,
      })
    ).toThrow(/uriHandler\.types/);
  });

  it('requires a function resolver', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        uriHandler: {
          types: ['transaction'],
          resolve: 'nope',
        } as unknown as never,
      })
    ).toThrow(/uriHandler\.resolve/);
  });
});

describe('assertModuleManifest — backend.aiTools slot', () => {
  it('accepts a well-formed AI tool descriptor', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        backend: {
          router: {},
          aiTools: [
            {
              name: 'finance.tx.find',
              description: 'find',
              inputSchema: { type: 'object' },
              handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
            },
          ],
        },
      })
    ).not.toThrow();
  });

  it('reports a missing handler', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        backend: {
          router: {},
          aiTools: [
            {
              name: 'finance.tx.find',
              description: 'find',
              inputSchema: { type: 'object' },
            },
          ],
        } as unknown as never,
      })
    ).toThrow(/backend\.aiTools\[0\]\.handler/);
  });
});

describe('assertModuleManifest — backend.migrations slot', () => {
  it('accepts a well-formed migration descriptor', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        backend: {
          router: {},
          migrations: [{ id: '2026_05_11_001_finance_init', sql: 'SELECT 1' }],
        },
      })
    ).not.toThrow();
  });

  it('reports a missing id', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        backend: {
          router: {},
          migrations: [{ sql: 'SELECT 1' }],
        } as unknown as never,
      })
    ).toThrow(/backend\.migrations\[0\]\.id/);
  });

  it('rejects a non-string sql', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        backend: {
          router: {},
          migrations: [{ id: '001', sql: 123 }],
        } as unknown as never,
      })
    ).toThrow(/backend\.migrations\[0\]\.sql/);
  });
});

describe('assertModuleManifest — backend.ingestSources slot', () => {
  it('accepts a well-formed ingest source descriptor', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        backend: {
          router: {},
          ingestSources: [{ id: 'plaid', label: 'Plaid' }],
        },
      })
    ).not.toThrow();
  });

  it('reports a missing label', () => {
    expect(() =>
      assertModuleManifest({
        ...baseManifest(),
        backend: {
          router: {},
          ingestSources: [{ id: 'plaid' }],
        } as unknown as never,
      })
    ).toThrow(/backend\.ingestSources\[0\]\.label/);
  });
});

describe('assertModuleManifest — frontend overlay invariant', () => {
  it('requires frontend.overlay when surfaces includes overlay', () => {
    expect(() =>
      assertModuleManifest({
        id: 'ego',
        name: 'Ego',
        surfaces: ['overlay'],
        frontend: {},
      })
    ).toThrow(/frontend\.overlay/);
  });

  it('accepts a valid overlay declaration', () => {
    expect(() =>
      assertModuleManifest({
        id: 'ego',
        name: 'Ego',
        surfaces: ['overlay'],
        frontend: { overlay: { chromeSlot: 'assistant' } },
      })
    ).not.toThrow();
  });

  it('accepts an overlay declaration with a lazy component loader', () => {
    expect(() =>
      assertModuleManifest({
        id: 'ego',
        name: 'Ego',
        surfaces: ['overlay'],
        frontend: {
          overlay: {
            chromeSlot: 'assistant',
            shortcut: 'mod+i',
            component: () => Promise.resolve({ default: () => null }),
          },
        },
      })
    ).not.toThrow();
  });

  it('rejects an overlay component that is not a function', () => {
    expect(() =>
      assertModuleManifest({
        id: 'ego',
        name: 'Ego',
        surfaces: ['overlay'],
        frontend: {
          overlay: { chromeSlot: 'assistant', component: 'not a function' },
        },
      })
    ).toThrow(/frontend\.overlay\.component/);
  });

  it('rejects a non-string shortcut', () => {
    expect(() =>
      assertModuleManifest({
        id: 'ego',
        name: 'Ego',
        surfaces: ['overlay'],
        frontend: { overlay: { chromeSlot: 'assistant', shortcut: 42 } },
      })
    ).toThrow(/frontend\.overlay\.shortcut/);
  });
});
