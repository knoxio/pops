/**
 * Workspace-discovery regression tests (PRD-241 US-02).
 *
 * The discovery walk is the input to `pnpm registry:build`. These tests
 * pin:
 *   - the walk finds every `@pops/*-contract` package's `./manifest`
 *     export under the real workspace,
 *   - missing `./manifest` subpaths are skipped (not throws),
 *   - the result is deterministic (sorted by id) regardless of FS order,
 *   - every contract package discovered is pinned as a `devDependency`
 *     of `@pops/module-registry` (the PRD calls this out as a hard
 *     invariant so missing pins surface loudly).
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { discoverManifestSources } from './known-modules.js';

import type { ModuleManifest } from '@pops/types';

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(here, '..');
const PACKAGES_ROOT = join(PACKAGE_ROOT, '..');
const REPO_ROOT = join(PACKAGES_ROOT, '..');
const PILLARS_ROOT = join(REPO_ROOT, 'pillars');

const EXPECTED_IDS = [
  'ai',
  'cerebrum',
  'core',
  'ego',
  'finance',
  'food',
  'inventory',
  'lists',
  'media',
] as const;

describe('discoverManifestSources', () => {
  it('finds every in-repo pillar manifest via workspace scan', async () => {
    const manifests = await discoverManifestSources({ log: () => undefined });
    const ids = manifests.map((m) => m.id);
    expect(ids).toEqual([...EXPECTED_IDS]);
  });

  it('returns deterministic sorted output regardless of filesystem iteration order', async () => {
    const a = await discoverManifestSources({ log: () => undefined });
    const b = await discoverManifestSources({ log: () => undefined });
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id));
    const ids = a.map((m) => m.id);
    const sorted = [...ids].toSorted((x, y) => x.localeCompare(y, 'en'));
    expect(ids).toEqual(sorted);
  });

  it('preserves the byte-stable MANIFEST_SOURCES shape — same fields, no drift', async () => {
    const manifests = await discoverManifestSources({ log: () => undefined });
    const byId = new Map(manifests.map((m) => [m.id, m] as const));

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
    const fixture = join(PACKAGES_ROOT, 'module-registry', 'src');
    const messages: string[] = [];
    const result = await discoverManifestSources({
      packagesRoot: fixture,
      log: (msg) => messages.push(msg),
    });
    expect(result).toEqual([]);
    expect(messages).toEqual([]);
  });

  it('skips a contract whose ./manifest export carries no ModuleManifest values', async () => {
    const messages: string[] = [];
    const result = await discoverManifestSources({
      log: (msg) => messages.push(msg),
      importManifest: async (pkg) => {
        if (pkg.name === '@pops/core') {
          return { unrelated: { foo: 'bar' } };
        }
        const { pathToFileURL } = await import('node:url');
        if (pkg.manifestEntry === undefined) throw new Error(`unreachable: ${pkg.name}`);
        const url = pathToFileURL(join(pkg.dir, pkg.manifestEntry)).href;
        const mod: unknown = await import(url);
        return mod as Record<string, unknown>;
      },
    });
    const ids = result.map((m) => m.id);
    expect(ids).not.toContain('core');
    // `ai` is no longer carried by `@pops/core` — it is a first-class pillar
    // (PRD-055) discovered from `@pops/ai`, so mocking core's manifest
    // empty no longer suppresses it.
    expect(messages.some((m) => m.includes('@pops/core'))).toBe(true);
  });

  it('every discovered contract package is pinned as a devDependency of @pops/module-registry', async () => {
    const pkgJsonRaw = await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8');
    const parsed = JSON.parse(pkgJsonRaw) as { devDependencies?: Record<string, string> };
    const devDeps = new Set(Object.keys(parsed.devDependencies ?? {}));

    const contractPkgPaths: string[] = [];

    const packageEntries = await readdir(PACKAGES_ROOT, { withFileTypes: true });
    for (const entry of packageEntries) {
      if (!entry.isDirectory() || !entry.name.endsWith('-contract')) continue;
      contractPkgPaths.push(join(PACKAGES_ROOT, entry.name, 'package.json'));
    }

    try {
      const pillarEntries = await readdir(PILLARS_ROOT, { withFileTypes: true });
      for (const entry of pillarEntries) {
        if (!entry.isDirectory()) continue;
        contractPkgPaths.push(join(PILLARS_ROOT, entry.name, 'contract', 'package.json'));
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    for (const pkgPath of contractPkgPaths) {
      let raw: string;
      try {
        raw = await readFile(pkgPath, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw err;
      }
      const pkg = JSON.parse(raw) as { name?: string; exports?: Record<string, unknown> };
      if (pkg.name === undefined || pkg.exports?.['./manifest'] === undefined) continue;
      expect(devDeps.has(pkg.name), `missing devDep pin: ${pkg.name}`).toBe(true);
    }
  });

  it('runs without filesystem access at runtime — only the build script consumes it', async () => {
    const generatedRaw = await readFile(join(PACKAGE_ROOT, 'src', 'generated.ts'), 'utf8');
    expect(generatedRaw).not.toMatch(/from 'node:fs/);
    expect(generatedRaw).not.toMatch(/from 'node:path/);
  });

  it('returns ModuleManifest-shaped objects (id, name, surfaces all populated)', async () => {
    const manifests = await discoverManifestSources({ log: () => undefined });
    for (const m of manifests) {
      const cast: ModuleManifest = m;
      expect(typeof cast.id).toBe('string');
      expect(cast.id.length).toBeGreaterThan(0);
      expect(typeof cast.name).toBe('string');
      expect(cast.name.length).toBeGreaterThan(0);
      expect(Array.isArray(cast.surfaces)).toBe(true);
      expect(cast.surfaces.length).toBeGreaterThan(0);
    }
  });
});
