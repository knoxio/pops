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

describe('collect-specs', () => {
  it('discovers the finance contract snapshot and emits a catalog entry', () => {
    rmSync(DIST_DIR, { recursive: true, force: true });

    const result = spawnSync('tsx', [resolve(HERE, 'collect-specs.ts')], {
      cwd: APP_ROOT,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);

    const catalog = JSON.parse(readFileSync(resolve(DIST_DIR, 'catalog.json'), 'utf8')) as Catalog;
    expect(catalog.generatedAt).toBeTypeOf('string');
    expect(catalog.contracts.length).toBeGreaterThanOrEqual(1);

    const finance = catalog.contracts.find((entry) => entry.id === 'finance');
    expect(finance, 'expected a finance contract entry in the catalog').toBeDefined();
    expect(finance?.openapiPath).toBe('/openapi/finance.json');
    expect(finance?.registryPillarId).toBe('finance');
    expect(finance?.contractTag).toMatch(/^contract-finance@v/);

    expect(existsSync(resolve(DIST_DIR, 'openapi', 'finance.json'))).toBe(true);
    expect(existsSync(resolve(DIST_DIR, 'index.html'))).toBe(true);
    expect(existsSync(resolve(DIST_DIR, 'styles.css'))).toBe(true);

    const copiedSpec = JSON.parse(
      readFileSync(resolve(DIST_DIR, 'openapi', 'finance.json'), 'utf8')
    ) as {
      info?: { title?: string };
    };
    const sourceSpec = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, 'packages/finance-contract/openapi/finance.openapi.json'),
        'utf8'
      )
    ) as { info?: { title?: string } };
    expect(copiedSpec.info?.title).toBe(sourceSpec.info?.title);
  });
});
