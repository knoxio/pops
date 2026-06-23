/**
 * Discovery-algorithm regression tests (PRD-241 US-02).
 *
 * `discoverManifestSources` is the input to `pnpm registry:build`. These tests
 * pin the *algorithm* in isolation, driven entirely off injected fixtures
 * (`packagesRoot` + `importManifest`) so the unit never depends on any pillar's
 * built `dist/` artifact existing. The end-to-end "every real in-repo pillar is
 * discovered with the correct data" guarantee is owned by the
 * `registry-generated-quality.yml` drift gate, which builds the whole graph and
 * diffs the committed `generated.ts`.
 *
 * Invariants pinned here:
 *   - the walk finds every fixture contract package's `./manifest` export,
 *   - a single package may contribute more than one `ModuleManifest`
 *     (e.g. the cerebrum contract carries both `cerebrumManifest` and
 *     `egoManifest`),
 *   - packages without a `./manifest` subpath are skipped (info-log, no throw),
 *   - a `./manifest` export carrying no `ModuleManifest` values is skipped,
 *   - the result is deterministic (sorted by id) regardless of FS order,
 *   - `frontend`/`settings`/`surfaces` fields survive discovery byte-stable,
 *   - the discovery never narrows to a fixed pillar set — adding a fixture
 *     contract package is enough; no edit to `module-registry` is required.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discoverManifestSources } from './known-modules.js';

import type { ModuleManifest, SettingsManifest } from '@pops/types';

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(here, '..');

interface FixtureContract {
  readonly dirName: string;
  readonly pkgName: string;
  readonly withManifestExport: boolean;
  readonly manifests: readonly ModuleManifest[];
}

const mediaPlexSettings: SettingsManifest = {
  id: 'media.plex',
  title: 'Plex',
  order: 100,
  groups: [{ id: 'connection', title: 'Connection', fields: [] }],
};

const CONTRACTS: readonly FixtureContract[] = [
  {
    dirName: 'media-contract',
    pkgName: '@pops/media-contract',
    withManifestExport: true,
    manifests: [
      {
        id: 'media',
        name: 'Media',
        surfaces: ['app'],
        settings: [mediaPlexSettings],
      },
    ],
  },
  {
    dirName: 'food-contract',
    pkgName: '@pops/food-contract',
    withManifestExport: true,
    manifests: [{ id: 'food', name: 'Food', surfaces: ['app'] }],
  },
  {
    dirName: 'cerebrum-contract',
    pkgName: '@pops/cerebrum-contract',
    withManifestExport: true,
    manifests: [
      { id: 'cerebrum', name: 'Cerebrum', surfaces: ['app'] },
      {
        id: 'ego',
        name: 'Ego',
        surfaces: ['app', 'overlay'],
        frontend: { overlay: { chromeSlot: 'assistant', shortcut: 'mod+i' } },
      },
    ],
  },
  {
    dirName: 'docs-contract',
    pkgName: '@pops/docs-contract',
    withManifestExport: false,
    manifests: [],
  },
  {
    dirName: 'empty-contract',
    pkgName: '@pops/empty-contract',
    withManifestExport: true,
    manifests: [],
  },
];

let fixtureRoot: string;

const importFixtureManifest = (() => {
  const byName = new Map<string, Record<string, unknown>>();
  for (const contract of CONTRACTS) {
    const mod: Record<string, unknown> = {};
    for (const m of contract.manifests) {
      mod[`${m.id}Manifest`] = m;
    }
    if (contract.pkgName === '@pops/empty-contract') {
      mod.unrelated = { foo: 'bar' };
    }
    byName.set(contract.pkgName, mod);
  }
  return async (pkg: { name: string }): Promise<Record<string, unknown>> => {
    const mod = byName.get(pkg.name);
    if (mod === undefined) throw new Error(`unexpected fixture package: ${pkg.name}`);
    return mod;
  };
})();

async function writeFixtureContract(root: string, contract: FixtureContract): Promise<void> {
  const dir = join(root, contract.dirName);
  await mkdir(dir, { recursive: true });
  const exports: Record<string, unknown> = { '.': './dist/index.js' };
  if (contract.withManifestExport) {
    exports['./manifest'] = { default: './dist/manifest.js' };
  }
  const pkgJson = { name: contract.pkgName, version: '0.0.0', exports };
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf8');
}

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'module-registry-discovery-'));
  for (const contract of CONTRACTS) {
    await writeFixtureContract(fixtureRoot, contract);
  }
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

function discover(extra: { log?: (m: string) => void } = {}) {
  return discoverManifestSources({
    packagesRoot: fixtureRoot,
    importManifest: importFixtureManifest,
    log: extra.log ?? (() => undefined),
  });
}

describe('discoverManifestSources', () => {
  it('finds every fixture contract manifest via the workspace scan', async () => {
    const ids = (await discover()).map((m) => m.id);
    expect(ids).toEqual(['cerebrum', 'ego', 'food', 'media']);
  });

  it('collects multiple manifests exported by a single contract package', async () => {
    const ids = (await discover()).map((m) => m.id);
    expect(ids).toContain('cerebrum');
    expect(ids).toContain('ego');
  });

  it('returns deterministic sorted output regardless of filesystem iteration order', async () => {
    const a = (await discover()).map((m) => m.id);
    const b = (await discover()).map((m) => m.id);
    expect(a).toEqual(b);
    expect(a).toEqual([...a].toSorted((x, y) => x.localeCompare(y, 'en')));
  });

  it('preserves frontend/settings/surfaces fields byte-stable through discovery', async () => {
    const byId = new Map((await discover()).map((m) => [m.id, m] as const));

    const ego = byId.get('ego');
    expect(ego?.surfaces).toEqual(['app', 'overlay']);
    expect(ego?.frontend?.overlay).toEqual({ chromeSlot: 'assistant', shortcut: 'mod+i' });

    const food = byId.get('food');
    expect(food?.settings).toBeUndefined();

    const media = byId.get('media');
    expect(media?.settings).toBeDefined();
    expect(media?.settings?.length).toBeGreaterThan(0);
  });

  it('skips packages without a ./manifest export (info-log, no throw)', async () => {
    const messages: string[] = [];
    const ids = (await discover({ log: (m) => messages.push(m) })).map((m) => m.id);
    expect(ids).not.toContain('docs');
    expect(messages.some((m) => m.includes('@pops/docs-contract'))).toBe(true);
  });

  it('skips a contract whose ./manifest export carries no ModuleManifest values', async () => {
    const messages: string[] = [];
    await discover({ log: (m) => messages.push(m) });
    expect(messages.some((m) => m.includes('@pops/empty-contract'))).toBe(true);
  });

  it('discovers without referencing any pillar id in package.json — adding a contract is enough', async () => {
    const pkgJsonRaw = await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8');
    const parsed = JSON.parse(pkgJsonRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...parsed.dependencies, ...parsed.devDependencies };
    const pillarPins = Object.keys(allDeps).filter(
      (name) =>
        name.startsWith('@pops/') &&
        !name.endsWith('-contract') &&
        name !== '@pops/types' &&
        name !== '@pops/pillar-sdk'
    );
    expect(pillarPins).toEqual([]);
  });

  it('returns ModuleManifest-shaped objects (id, name, surfaces all populated)', async () => {
    for (const m of await discover()) {
      const cast: ModuleManifest = m;
      expect(typeof cast.id).toBe('string');
      expect(cast.id.length).toBeGreaterThan(0);
      expect(typeof cast.name).toBe('string');
      expect(cast.name.length).toBeGreaterThan(0);
      expect(Array.isArray(cast.surfaces)).toBe(true);
      expect(cast.surfaces.length).toBeGreaterThan(0);
    }
  });

  it('the committed generated.ts has no runtime filesystem access — only the build script walks disk', async () => {
    const generatedRaw = await readFile(join(PACKAGE_ROOT, 'src', 'generated.ts'), 'utf8');
    expect(generatedRaw).not.toMatch(/from 'node:fs/);
    expect(generatedRaw).not.toMatch(/from 'node:path/);
  });
});
