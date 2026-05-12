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

  it('warns (without throwing) on unknown overlay chromeSlot values (US-07)', () => {
    const messages: string[] = [];
    const sample: readonly ModuleManifest[] = [
      {
        id: 'rogue',
        name: 'Rogue',
        surfaces: ['overlay'],
        frontend: { overlay: { chromeSlot: 'totally-made-up' } },
      },
    ];
    expect(() => validateManifests(sample, (m) => messages.push(m))).not.toThrow();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/rogue/);
    expect(messages[0]).toMatch(/totally-made-up/);
  });

  it('does not warn on known overlay chromeSlot values', () => {
    const messages: string[] = [];
    const sample: readonly ModuleManifest[] = [
      {
        id: 'ego',
        name: 'Ego',
        surfaces: ['overlay', 'app'],
        frontend: { overlay: { chromeSlot: 'assistant' } },
      },
    ];
    expect(() => validateManifests(sample, (m) => messages.push(m))).not.toThrow();
    expect(messages).toEqual([]);
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

  it('keeps alwaysInstalled ids in the result regardless of env restrictions', () => {
    const knownPlusCore = ['core', ...known];
    expect(resolveInstalledIds(knownPlusCore, { POPS_APPS: 'finance' }, ['core'])).toEqual([
      'core',
      'finance',
    ]);
  });

  it('alwaysInstalled has no effect when env is unset (already includes everything)', () => {
    expect(resolveInstalledIds(known, {}, ['finance'])).toEqual(known);
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

  it('clones the settings slot so consumers cannot mutate the source manifest', () => {
    const settings = [
      {
        id: 'a.section',
        title: 'Section',
        order: 1,
        groups: [{ id: 'g', title: 'g', fields: [] }],
      },
    ];
    const m: ModuleManifest = { id: 'a', name: 'A', surfaces: ['app'], settings };
    const p = project(m);
    expect(p.settings).toEqual(settings);
    expect(p.settings).not.toBe(settings);
  });

  it('leaves settings undefined when the manifest does not declare any', () => {
    const m: ModuleManifest = { id: 'a', name: 'A', surfaces: ['app'] };
    expect(project(m).settings).toBeUndefined();
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

  it('emits the settings slot as an inline literal typed as SettingsManifest[]', () => {
    const sample: readonly ModuleManifest[] = [
      {
        id: 'finance',
        name: 'Finance',
        surfaces: ['app'],
        settings: [
          {
            id: 'finance.aiCategorizer',
            title: 'AI Categorizer',
            order: 140,
            groups: [
              {
                id: 'g',
                title: 'g',
                fields: [
                  { key: 'finance.aiCategorizer.model', label: 'Categorizer Model', type: 'text' },
                ],
              },
            ],
          },
        ],
      },
    ];
    const out = buildRegistrySource(sample, ['finance'], {});
    expect(out.source).toContain("import type { SettingsManifest } from '@pops/types'");
    expect(out.source).toContain("id: 'finance.aiCategorizer'");
    expect(out.source).toContain('satisfies readonly SettingsManifest[]');
  });

  it('omits the SettingsManifest import when no manifest declares settings', () => {
    const out = buildRegistrySource(SAMPLE, ['finance', 'media', 'ego'], {});
    expect(out.source).not.toContain('SettingsManifest');
  });

  it('respects alwaysInstalled when env filters would otherwise exclude a module', () => {
    const sample: readonly ModuleManifest[] = [
      { id: 'core', name: 'Core', surfaces: ['app'] },
      { id: 'finance', name: 'Finance', surfaces: ['app'] },
    ];
    const out = buildRegistrySource(
      sample,
      ['core', 'finance'],
      { POPS_APPS: 'finance' },
      { alwaysInstalled: ['core'] }
    );
    expect(out.count).toBe(2);
    expect(out.source).toContain("id: 'core'");
    expect(out.source).toContain("id: 'finance'");
  });
});

describe('renderFile', () => {
  it('always ends with a trailing newline', () => {
    const out = renderFile([]);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('escapes control characters and line/paragraph separators in emitted string literals', () => {
    const name = [
      'line',
      String.fromCharCode(10),
      'tab',
      String.fromCharCode(9),
      'sep',
      String.fromCharCode(0x2028),
      'para',
      String.fromCharCode(0x2029),
      "quote'",
      'back\\',
    ].join('');
    const out = renderFile([
      {
        id: 'ctrl',
        name,
        surfaces: ['app'],
        hasBackend: false,
        hasFrontend: true,
      },
    ]);
    const nameLine = out.split('\n').find((l) => l.includes('name:'));
    expect(nameLine).toBeDefined();
    expect(nameLine).toContain('\\n');
    expect(nameLine).toContain('\\t');
    expect(nameLine).toContain('\\u2028');
    expect(nameLine).toContain('\\u2029');
    expect(nameLine).toContain("\\'");
    expect(nameLine).toContain('\\\\');
  });
});
