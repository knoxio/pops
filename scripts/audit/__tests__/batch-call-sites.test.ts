import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildFileReport,
  extractCallSites,
  listSourceFiles,
  renderInventory,
  runAudit,
} from '../batch-call-sites.js';

describe('extractCallSites', () => {
  it('captures trpc.<pillar>.<...>.useQuery sites with their pillar and path', () => {
    const source = [
      'import { trpc } from "../lib/trpc";',
      'function Page() {',
      '  const q = trpc.finance.transactions.list.useQuery();',
      '  return q.data;',
      '}',
    ].join('\n');
    const sites = extractCallSites('apps/pops-shell/src/Page.tsx', source);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      pillar: 'finance',
      path: 'finance.transactions.list.useQuery',
      line: 3,
      file: 'apps/pops-shell/src/Page.tsx',
    });
    expect(sites[0]?.raw).toBe('trpc.finance.transactions.list.useQuery');
  });

  it('captures useMutation, useInfiniteQuery and useSubscription variants', () => {
    const source = [
      'trpc.media.watchlist.add.useMutation();',
      'trpc.cerebrum.engrams.list.useInfiniteQuery();',
      'trpc.inventory.items.streamUpdates.useSubscription();',
    ].join('\n');
    const sites = extractCallSites('x.ts', source);
    expect(sites.map((s) => s.path)).toEqual([
      'media.watchlist.add.useMutation',
      'cerebrum.engrams.list.useInfiniteQuery',
      'inventory.items.streamUpdates.useSubscription',
    ]);
  });

  it('captures utils.<pillar>.* sites from trpc.useUtils()', () => {
    const source = [
      'const utils = trpc.useUtils();',
      'await utils.finance.transactions.list.invalidate();',
      'await utils.core.features.list.cancel();',
    ].join('\n');
    const sites = extractCallSites('x.ts', source);
    expect(sites).toHaveLength(2);
    expect(sites[0]).toMatchObject({ pillar: 'finance', raw: expect.stringMatching(/^utils\./) });
    expect(sites[1]).toMatchObject({ pillar: 'core' });
  });

  it('ignores trpc.<word>.* where <word> is not a known pillar', () => {
    const source = ['trpc.Provider;', 'trpc.useUtils();', 'trpc.notARealPillar.x.useQuery();'].join(
      '\n'
    );
    const sites = extractCallSites('x.ts', source);
    expect(sites).toEqual([]);
  });

  it('reports the line number for the start of the match', () => {
    const source = ['// header', '', '', 'trpc.media.movies.list.useQuery();'].join('\n');
    const sites = extractCallSites('x.ts', source);
    expect(sites).toHaveLength(1);
    expect(sites[0]?.line).toBe(4);
  });

  it('returns sites in source order even when trpc.* and utils.* interleave', () => {
    const source = [
      'utils.finance.foo.bar();',
      'trpc.media.x.y.useQuery();',
      'utils.core.a.b();',
    ].join('\n');
    const sites = extractCallSites('x.ts', source);
    expect(sites.map((s) => s.pillar)).toEqual(['finance', 'media', 'core']);
    expect(sites.map((s) => s.line)).toEqual([1, 2, 3]);
  });
});

describe('buildFileReport', () => {
  it('flags a file with sites from a single pillar as not cross-pillar', () => {
    const sites = extractCallSites(
      'x.ts',
      ['trpc.finance.a.b.useQuery();', 'trpc.finance.c.d.useQuery();'].join('\n')
    );
    const report = buildFileReport('x.ts', sites);
    expect(report.pillars).toEqual(['finance']);
    expect(report.crossPillar).toBe(false);
  });

  it('flags a file with sites from ≥2 pillars as cross-pillar', () => {
    const sites = extractCallSites(
      'x.ts',
      ['trpc.finance.a.b.useQuery();', 'trpc.media.c.d.useQuery();'].join('\n')
    );
    const report = buildFileReport('x.ts', sites);
    expect(report.pillars).toEqual(['finance', 'media']);
    expect(report.crossPillar).toBe(true);
  });

  it('returns pillars in canonical PILLARS order regardless of source order', () => {
    const sites = extractCallSites(
      'x.ts',
      ['trpc.media.a.b.useQuery();', 'trpc.core.c.d.useQuery();'].join('\n')
    );
    const report = buildFileReport('x.ts', sites);
    expect(report.pillars).toEqual(['core', 'media']);
  });
});

describe('listSourceFiles and runAudit', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), 'batch-call-sites-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeAt(rel: string, contents: string): void {
    const full = resolve(dir, rel);
    mkdirSync(resolve(full, '..'), { recursive: true });
    writeFileSync(full, contents, 'utf8');
  }

  it('includes .ts and .tsx, excludes .d.ts and skip-dirs', () => {
    writeAt('apps/pops-shell/src/a.tsx', 'trpc.finance.x.y.useQuery();');
    writeAt('apps/pops-shell/src/b.ts', 'trpc.media.x.y.useQuery();');
    writeAt('apps/pops-shell/src/c.d.ts', 'export type T = number;');
    writeAt('apps/pops-shell/src/node_modules/junk.ts', 'trpc.finance.x.y.useQuery();');
    writeAt('apps/pops-shell/src/dist/built.ts', 'trpc.finance.x.y.useQuery();');
    const files = listSourceFiles([resolve(dir, 'apps/pops-shell/src')]);
    expect(files.map((f) => f.replace(`${dir}/`, '')).toSorted()).toEqual([
      'apps/pops-shell/src/a.tsx',
      'apps/pops-shell/src/b.ts',
    ]);
  });

  it('produces an AuditReport with per-pillar counts and cross-pillar files', () => {
    writeAt(
      'apps/pops-shell/src/Dashboard.tsx',
      ['trpc.finance.transactions.list.useQuery();', 'trpc.media.movies.recent.useQuery();'].join(
        '\n'
      )
    );
    writeAt('packages/app-finance/src/Page.tsx', 'trpc.finance.budgets.list.useQuery();');
    writeAt('packages/app-media/src/Watchlist.tsx', 'trpc.media.watchlist.list.useQuery();');
    const report = runAudit({
      repoRoot: dir,
      roots: [
        resolve(dir, 'apps/pops-shell/src'),
        resolve(dir, 'packages/app-finance/src'),
        resolve(dir, 'packages/app-media/src'),
      ],
    });
    expect(report.totalSites).toBe(4);
    expect(report.files).toHaveLength(3);
    expect(report.perPillarCounts.finance).toBe(2);
    expect(report.perPillarCounts.media).toBe(2);
    expect(report.perPillarCounts.core).toBe(0);
    expect(report.crossPillarFiles).toHaveLength(1);
    expect(report.crossPillarFiles[0]?.file).toBe('apps/pops-shell/src/Dashboard.tsx');
    expect(report.crossPillarFiles[0]?.pillars).toEqual(['finance', 'media']);
  });

  it('renders an inventory markdown that lists totals and cross-pillar files', () => {
    writeAt(
      'apps/pops-shell/src/Dashboard.tsx',
      ['trpc.finance.transactions.list.useQuery();', 'trpc.media.movies.recent.useQuery();'].join(
        '\n'
      )
    );
    const report = runAudit({
      repoRoot: dir,
      roots: [resolve(dir, 'apps/pops-shell/src')],
    });
    const md = renderInventory(report);
    expect(md).toContain('# PRD-189: Batch call-site inventory');
    expect(md).toContain('Total tRPC call sites: **2**');
    expect(md).toContain('apps/pops-shell/src/Dashboard.tsx');
    expect(md).toContain('finance + media');
  });
});
