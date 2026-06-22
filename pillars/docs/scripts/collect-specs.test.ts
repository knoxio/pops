import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Catalog } from '../src/catalog.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(APP_ROOT, '..', '..');
const DIST_DIR = resolve(APP_ROOT, 'dist');

/**
 * Every pillar that ships a committed `openapi/<id>.openapi.json`. The
 * federation refactor folded the old `packages/<id>-contract` snapshots
 * into each pillar, renamed `core`→`registry`, and added the `ai` and
 * (Rust) `contacts` pillars — so this set is the live source of truth, not
 * the pre-move `packages/*-contract` list.
 */
const EXPECTED_PILLARS = [
  'ai',
  'cerebrum',
  'contacts',
  'finance',
  'food',
  'inventory',
  'lists',
  'media',
  'registry',
] as const;

describe('collect-specs', () => {
  it('discovers every pillar contract snapshot and emits a catalog entry per pillar', () => {
    rmSync(DIST_DIR, { recursive: true, force: true });

    const result = spawnSync('tsx', [resolve(HERE, 'collect-specs.ts')], {
      cwd: APP_ROOT,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);

    const catalog = JSON.parse(readFileSync(resolve(DIST_DIR, 'catalog.json'), 'utf8')) as Catalog;
    expect(catalog.generatedAt).toBeTypeOf('string');
    expect(catalog.contracts).toHaveLength(EXPECTED_PILLARS.length);

    const ids = catalog.contracts.map((entry) => entry.id).toSorted();
    expect(ids).toEqual([...EXPECTED_PILLARS].toSorted());

    for (const pillar of EXPECTED_PILLARS) {
      const entry = catalog.contracts.find((c) => c.id === pillar);
      if (!entry) throw new Error(`expected a ${pillar} contract entry in the catalog`);
      expect(entry.openapiPath).toBe(`/openapi/${pillar}.json`);
      expect(entry.registryPillarId).toBe(pillar);
      expect(entry.contractTag).toMatch(new RegExp(`^contract-${pillar}@v`));

      expect(existsSync(resolve(DIST_DIR, 'openapi', `${pillar}.json`))).toBe(true);

      const copiedSpec = JSON.parse(
        readFileSync(resolve(DIST_DIR, 'openapi', `${pillar}.json`), 'utf8')
      ) as { info?: { title?: string } };
      const sourceSpec = JSON.parse(
        readFileSync(resolve(REPO_ROOT, `pillars/${pillar}/openapi/${pillar}.openapi.json`), 'utf8')
      ) as { info?: { title?: string } };
      expect(copiedSpec.info?.title).toBe(sourceSpec.info?.title);
    }

    expect(existsSync(resolve(DIST_DIR, 'index.html'))).toBe(true);
    expect(existsSync(resolve(DIST_DIR, 'styles.css'))).toBe(true);
  });
});
