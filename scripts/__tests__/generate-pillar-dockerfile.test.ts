import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  copySourcesFor,
  generateDockerfile,
  parsePillarTransitiveDeps,
  parseWorkspacePackagePaths,
  renderDockerfile,
} from '../generate-pillar-dockerfile.mjs';

interface FixtureFile {
  readonly path: string;
  readonly content?: string;
}

function writeFixture(root: string, files: readonly FixtureFile[]): void {
  for (const f of files) {
    const abs = resolve(root, f.path);
    mkdirSync(resolve(abs, '..'), { recursive: true });
    writeFileSync(abs, f.content ?? '');
  }
}

describe('parseWorkspacePackagePaths', () => {
  it('filters out the monorepo root and returns sorted repo-relative paths', () => {
    const root = '/repo';
    const raw = JSON.stringify([
      { name: '@pops/monorepo', path: '/repo' },
      { name: '@pops/core-api', path: '/repo/apps/pops-core-api' },
      { name: '@pops/core-db', path: '/repo/packages/core-db' },
      { name: '@pops/core-contract', path: '/repo/packages/core-contract' },
    ]);

    expect(parseWorkspacePackagePaths(raw, root)).toEqual([
      'apps/pops-core-api',
      'packages/core-contract',
      'packages/core-db',
    ]);
  });

  it('drops entries missing name or path', () => {
    const raw = JSON.stringify([
      { name: '@pops/core-db', path: '/repo/packages/core-db' },
      { name: '@pops/orphan' },
      { path: '/repo/packages/ghost' },
    ]);

    expect(parseWorkspacePackagePaths(raw, '/repo')).toEqual(['packages/core-db']);
  });
});

describe('parsePillarTransitiveDeps', () => {
  it('keeps @pops/* entries with paths and skips the monorepo root', () => {
    const raw = JSON.stringify([
      { name: '@pops/monorepo', path: '/repo' },
      { name: '@pops/core-api', path: '/repo/apps/pops-core-api' },
      { name: '@pops/core-db', path: '/repo/packages/core-db' },
      { name: 'zod', path: '/repo/node_modules/zod' },
    ]);

    expect(parsePillarTransitiveDeps(raw, '/repo')).toEqual([
      { name: '@pops/core-api', path: 'apps/pops-core-api' },
      { name: '@pops/core-db', path: 'packages/core-db' },
    ]);
  });
});

describe('copySourcesFor', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gen-dockerfile-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns only paths that exist on disk, in the canonical order', () => {
    writeFixture(root, [
      { path: 'packages/core-db/src/index.ts' },
      { path: 'packages/core-db/migrations/0001.sql' },
      { path: 'packages/core-db/tsconfig.json' },
    ]);

    expect(copySourcesFor(root, 'packages/core-db')).toEqual([
      'packages/core-db/src',
      'packages/core-db/migrations',
      'packages/core-db/tsconfig.json',
    ]);
  });

  it('returns the empty list when nothing matches', () => {
    writeFixture(root, [{ path: 'packages/empty/README.md' }]);
    expect(copySourcesFor(root, 'packages/empty')).toEqual([]);
  });

  it('emits scripts, openapi, and tsconfig.build.json when present', () => {
    writeFixture(root, [
      { path: 'packages/core-contract/src/index.ts' },
      { path: 'packages/core-contract/scripts/build.ts' },
      { path: 'packages/core-contract/openapi/spec.yaml' },
      { path: 'packages/core-contract/tsconfig.json' },
      { path: 'packages/core-contract/tsconfig.build.json' },
    ]);

    expect(copySourcesFor(root, 'packages/core-contract')).toEqual([
      'packages/core-contract/src',
      'packages/core-contract/scripts',
      'packages/core-contract/openapi',
      'packages/core-contract/tsconfig.json',
      'packages/core-contract/tsconfig.build.json',
    ]);
  });
});

describe('renderDockerfile', () => {
  it('emits Phase 1 COPY lines for every workspace package.json', () => {
    const out = renderDockerfile({
      pillar: 'core',
      allWorkspacePaths: ['apps/pops-core-api', 'packages/core-db', 'packages/finance-db'],
      sharedDeps: [],
      appSources: ['apps/pops-core-api/src', 'apps/pops-core-api/tsconfig.json'],
    });

    expect(out).toContain('COPY apps/pops-core-api/package.json ./apps/pops-core-api/');
    expect(out).toContain('COPY packages/core-db/package.json ./packages/core-db/');
    expect(out).toContain('COPY packages/finance-db/package.json ./packages/finance-db/');
  });

  it('only emits Phase 2 source COPY lines for the transitive deps', () => {
    const out = renderDockerfile({
      pillar: 'core',
      allWorkspacePaths: ['apps/pops-core-api', 'packages/core-db', 'packages/finance-db'],
      sharedDeps: [
        {
          name: '@pops/core-db',
          path: 'packages/core-db',
          sources: ['packages/core-db/src', 'packages/core-db/migrations'],
        },
      ],
      appSources: ['apps/pops-core-api/src'],
    });

    expect(out).toContain('# @pops/core-db');
    expect(out).toContain('COPY packages/core-db/src ./packages/core-db/src');
    expect(out).toContain('COPY packages/core-db/migrations ./packages/core-db/migrations');
    expect(out).not.toContain('COPY packages/finance-db/src');
    expect(out).not.toContain('COPY packages/finance-db/migrations');
  });

  it('skips shared deps with no buildable sources but keeps later deps', () => {
    const out = renderDockerfile({
      pillar: 'core',
      allWorkspacePaths: ['apps/pops-core-api'],
      sharedDeps: [
        { name: '@pops/types-only', path: 'packages/types-only', sources: [] },
        {
          name: '@pops/core-db',
          path: 'packages/core-db',
          sources: ['packages/core-db/src'],
        },
      ],
      appSources: ['apps/pops-core-api/src'],
    });

    expect(out).not.toContain('# @pops/types-only');
    expect(out).toContain('# @pops/core-db');
  });

  it('uses topology-aware pnpm build filters for the pillar package', () => {
    const out = renderDockerfile({
      pillar: 'finance',
      allWorkspacePaths: ['apps/pops-finance-api'],
      sharedDeps: [],
      appSources: ['apps/pops-finance-api/src'],
    });

    expect(out).toContain('RUN pnpm --filter "@pops/finance-api^..." build');
    expect(out).toContain('RUN pnpm --filter "@pops/finance-api" build');
    expect(out).toContain('RUN pnpm --filter @pops/finance-api deploy --prod --legacy /app/deploy');
  });

  it('includes the regeneration banner with the pillar name', () => {
    const out = renderDockerfile({
      pillar: 'inventory',
      allWorkspacePaths: ['apps/pops-inventory-api'],
      sharedDeps: [],
      appSources: ['apps/pops-inventory-api/src'],
    });

    expect(out).toContain('node scripts/generate-pillar-dockerfile.mjs inventory');
    expect(out).toContain('# DO NOT EDIT');
    expect(out).toContain('PRD-252 / audit H-D1');
  });

  it('ends with a trailing newline', () => {
    const out = renderDockerfile({
      pillar: 'core',
      allWorkspacePaths: [],
      sharedDeps: [],
      appSources: [],
    });
    expect(out.endsWith('\n')).toBe(true);
  });
});

describe('generateDockerfile', () => {
  it('walks transitive deps and narrows Phase 2 to the pillar subgraph', () => {
    const out = generateDockerfile({
      pillar: 'core',
      allWorkspacePaths: [
        'apps/pops-core-api',
        'apps/pops-finance-api',
        'packages/core-db',
        'packages/finance-db',
      ],
      transitiveDeps: [
        { name: '@pops/core-api', path: 'apps/pops-core-api' },
        { name: '@pops/core-db', path: 'packages/core-db' },
      ],
      sourcesFor: (pkgDir) => {
        const tree: Record<string, string[]> = {
          'packages/core-db': ['packages/core-db/src', 'packages/core-db/migrations'],
          'apps/pops-core-api': ['apps/pops-core-api/src', 'apps/pops-core-api/tsconfig.json'],
        };
        return tree[pkgDir] ?? [];
      },
    });

    expect(out).toContain('COPY apps/pops-finance-api/package.json ./apps/pops-finance-api/');
    expect(out).toContain('COPY packages/finance-db/package.json ./packages/finance-db/');
    expect(out).not.toContain('COPY packages/finance-db/src');
    expect(out).not.toContain('COPY packages/finance-db/migrations');
    expect(out).toContain('COPY packages/core-db/src ./packages/core-db/src');
    expect(out).toContain('COPY packages/core-db/migrations ./packages/core-db/migrations');
    expect(out).toContain('COPY apps/pops-core-api/src ./apps/pops-core-api/src');
  });

  it('sorts shared deps by path for deterministic output', () => {
    const out = generateDockerfile({
      pillar: 'core',
      allWorkspacePaths: ['apps/pops-core-api'],
      transitiveDeps: [
        { name: '@pops/core-api', path: 'apps/pops-core-api' },
        { name: '@pops/types', path: 'packages/types' },
        { name: '@pops/core-db', path: 'packages/core-db' },
        { name: '@pops/core-contract', path: 'packages/core-contract' },
      ],
      sourcesFor: (pkgDir) => [`${pkgDir}/src`],
    });

    const idxContract = out.indexOf('# @pops/core-contract');
    const idxDb = out.indexOf('# @pops/core-db');
    const idxTypes = out.indexOf('# @pops/types');
    expect(idxContract).toBeGreaterThan(-1);
    expect(idxDb).toBeGreaterThan(idxContract);
    expect(idxTypes).toBeGreaterThan(idxDb);
  });

  it('throws when the target app is not present in the dep graph', () => {
    expect(() =>
      generateDockerfile({
        pillar: 'core',
        allWorkspacePaths: ['apps/pops-core-api'],
        transitiveDeps: [{ name: '@pops/core-db', path: 'packages/core-db' }],
        sourcesFor: () => [],
      })
    ).toThrow(/did not return the target app @pops\/core-api/);
  });

  it('produces output stable across calls for the same input', () => {
    const args = {
      pillar: 'core' as const,
      allWorkspacePaths: ['apps/pops-core-api', 'packages/core-db'],
      transitiveDeps: [
        { name: '@pops/core-api', path: 'apps/pops-core-api' },
        { name: '@pops/core-db', path: 'packages/core-db' },
      ],
      sourcesFor: (pkgDir: string) => [`${pkgDir}/src`],
    };

    expect(generateDockerfile(args)).toBe(generateDockerfile(args));
  });
});
