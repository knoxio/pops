import { describe, expect, it } from 'vitest';

import {
  buildRegistrySource,
  project,
  renderFile,
  resolveInstalledIds,
  validateManifests,
} from './lib.js';

import type { ModuleManifest } from '@pops/types';

const SAMPLE: readonly ModuleManifest[] = [
  { id: 'finance', name: 'Finance', surfaces: ['app'] },
  { id: 'media', name: 'Media', surfaces: ['app'] },
  {
    id: 'ego',
    name: 'Ego',
    surfaces: ['overlay', 'app'],
    frontend: { overlay: { chromeSlot: 'assistant', shortcut: 'mod+i' } },
  },
];

describe('validateManifests', () => {
  it('passes on a clean list', () => {
    expect(() => validateManifests(SAMPLE)).not.toThrow();
  });

  it('fails on duplicate ids', () => {
    const dup: readonly ModuleManifest[] = [
      { id: 'finance', name: 'Finance', surfaces: ['app'] },
      { id: 'finance', name: 'Finance II', surfaces: ['app'] },
    ];
    expect(() => validateManifests(dup)).toThrow(/duplicate module id 'finance'/);
  });

  it('fails on a manifest missing required fields', () => {
    const bad: readonly unknown[] = [{ id: '', name: 'noop', surfaces: ['app'] }];
    expect(() => validateManifests(bad as readonly ModuleManifest[])).toThrow(
      /'id' must be a non-empty string/
    );
  });

  it('fails on dangling dependsOn', () => {
    const bad: readonly ModuleManifest[] = [
      { id: 'a', name: 'A', surfaces: ['app'], dependsOn: ['ghost'] },
    ];
    expect(() => validateManifests(bad)).toThrow(/dependsOn 'ghost'/);
  });

  it('passes when dependsOn references another known module', () => {
    const ok: readonly ModuleManifest[] = [
      { id: 'a', name: 'A', surfaces: ['app'] },
      { id: 'b', name: 'B', surfaces: ['app'], dependsOn: ['a'] },
    ];
    expect(() => validateManifests(ok)).not.toThrow();
  });

  it('fails on URI handler type collisions across modules', () => {
    const bad: readonly ModuleManifest[] = [
      {
        id: 'a',
        name: 'A',
        surfaces: ['app'],
        uriHandler: { types: ['thing'], resolve: async () => ({ kind: 'not-found' }) },
      },
      {
        id: 'b',
        name: 'B',
        surfaces: ['app'],
        uriHandler: { types: ['thing'], resolve: async () => ({ kind: 'not-found' }) },
      },
    ];
    expect(() => validateManifests(bad)).toThrow(/URI handler type 'thing'/);
  });

  it('fails on AI tool name collisions', () => {
    const handler = async () => ({ content: [{ type: 'text' as const, text: '' }] });
    const bad: readonly ModuleManifest[] = [
      {
        id: 'a',
        name: 'A',
        surfaces: ['app'],
        backend: {
          router: {},
          aiTools: [{ name: 'shared', description: '...', inputSchema: {}, handler }],
        },
      },
      {
        id: 'b',
        name: 'B',
        surfaces: ['app'],
        backend: {
          router: {},
          aiTools: [{ name: 'shared', description: '...', inputSchema: {}, handler }],
        },
      },
    ];
    expect(() => validateManifests(bad)).toThrow(/AI tool name 'shared'/);
  });
});

describe('resolveInstalledIds', () => {
  const known = ['finance', 'media', 'inventory'] as const;

  it('returns every known id when env is unset', () => {
    expect(resolveInstalledIds(known, {})).toEqual(known);
  });

  it('intersects with POPS_APPS when set', () => {
    expect(resolveInstalledIds(known, { POPS_APPS: 'finance,inventory' })).toEqual([
      'finance',
      'inventory',
    ]);
  });

  it('combines POPS_APPS and POPS_OVERLAYS', () => {
    const knownPlusEgo = [...known, 'ego'];
    expect(
      resolveInstalledIds(knownPlusEgo, { POPS_APPS: 'finance', POPS_OVERLAYS: 'ego' })
    ).toEqual(['finance', 'ego']);
  });

  it('drops env entries that are not in KNOWN_MODULES', () => {
    expect(resolveInstalledIds(known, { POPS_APPS: 'finance,not-real' })).toEqual(['finance']);
  });

  it('treats whitespace-only env as "no list provided" (returns intersection of [])', () => {
    expect(resolveInstalledIds(known, { POPS_APPS: '   ', POPS_OVERLAYS: '' })).toEqual([]);
  });
});

describe('project', () => {
  it('exposes overlay metadata for surfaces that include overlay', () => {
    const ego = SAMPLE.find((m) => m.id === 'ego');
    expect(ego).toBeDefined();
    if (ego === undefined) return;
    const projected = project(ego);
    expect(projected.overlay).toEqual({ chromeSlot: 'assistant', shortcut: 'mod+i' });
    expect(projected.hasFrontend).toBe(true);
    expect(projected.hasBackend).toBe(false);
  });

  it('clones array slots to insulate the output from later mutations', () => {
    const m: ModuleManifest = {
      id: 'a',
      name: 'A',
      surfaces: ['app'],
      capabilities: ['a.read'],
    };
    const p = project(m);
    expect(p.capabilities).toEqual(['a.read']);
    expect(p.capabilities).not.toBe(m.capabilities);
  });
});

describe('buildRegistrySource', () => {
  it('produces deterministic byte-identical output across runs', () => {
    const env = { POPS_APPS: 'finance,media' };
    const a = buildRegistrySource(SAMPLE, ['finance', 'media', 'ego'], env);
    const b = buildRegistrySource(SAMPLE, ['finance', 'media', 'ego'], env);
    expect(a.source).toBe(b.source);
  });

  it('renders modules sorted by id regardless of source order', () => {
    const a = buildRegistrySource(SAMPLE, ['finance', 'media', 'ego'], {});
    const reversed = SAMPLE.toReversed();
    const b = buildRegistrySource(reversed, ['finance', 'media', 'ego'], {});
    expect(a.source).toBe(b.source);
  });

  it('intersects MODULES with the env-resolved install set', () => {
    const out = buildRegistrySource(SAMPLE, ['finance', 'media', 'ego'], { POPS_APPS: 'media' });
    expect(out.count).toBe(1);
    expect(out.source).toContain("id: 'media'");
    expect(out.source).not.toContain("id: 'finance'");
  });

  it('emits an empty MODULES array (and never type) when nothing is installed', () => {
    const out = buildRegistrySource(SAMPLE, ['finance'], { POPS_APPS: 'not-real' });
    expect(out.count).toBe(0);
    expect(out.source).toContain('export const MODULES = [] as const;');
    expect(out.source).toContain('export type GeneratedModuleId = never;');
  });

  it('emits as-const surfaces tuples and a literal id union', () => {
    const out = buildRegistrySource(SAMPLE, ['finance', 'media', 'ego'], {});
    expect(out.source).toContain("surfaces: ['app'] as const");
    expect(out.source).toContain("surfaces: ['overlay', 'app'] as const");
    expect(out.source).toContain("export type GeneratedModuleId = 'ego' | 'finance' | 'media'");
  });
});

describe('renderFile', () => {
  it('always ends with a trailing newline', () => {
    const out = renderFile([]);
    expect(out.endsWith('\n')).toBe(true);
  });
});
