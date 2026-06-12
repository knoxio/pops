import { describe, expect, it } from 'vitest';

import { buildCatalog, type CollectedContract } from './catalog.ts';

function makeContract(overrides: Partial<CollectedContract> & { id: string }): CollectedContract {
  return {
    packageName: `@pops/${overrides.id}-contract`,
    packageVersion: '0.1.0',
    sourcePath: `/tmp/${overrides.id}.openapi.json`,
    snapshot: {},
    ...overrides,
  };
}

describe('buildCatalog', () => {
  it('preserves generatedAt unchanged', () => {
    const catalog = buildCatalog({ generatedAt: 'abc123', contracts: [] });
    expect(catalog.generatedAt).toBe('abc123');
  });

  it('produces an empty catalog when no contracts are collected', () => {
    const catalog = buildCatalog({ generatedAt: 'sha', contracts: [] });
    expect(catalog.contracts).toEqual([]);
  });

  it('maps a contract using OpenAPI info.title + info.version when present', () => {
    const catalog = buildCatalog({
      generatedAt: 'sha',
      contracts: [
        makeContract({
          id: 'finance',
          packageVersion: '0.1.0',
          snapshot: { info: { title: 'Finance Pillar', version: '1.4.2' } },
        }),
      ],
    });

    expect(catalog.contracts).toHaveLength(1);
    expect(catalog.contracts[0]).toEqual({
      id: 'finance',
      name: 'Finance Pillar',
      version: '1.4.2',
      openapiPath: '/openapi/finance.json',
      registryPillarId: 'finance',
      contractTag: 'contract-finance@v1.4.2',
    });
  });

  it('falls back to capitalised id when info.title is missing', () => {
    const catalog = buildCatalog({
      generatedAt: 'sha',
      contracts: [makeContract({ id: 'media', packageVersion: '0.3.0' })],
    });

    expect(catalog.contracts[0]?.name).toBe('Media');
    expect(catalog.contracts[0]?.version).toBe('0.3.0');
    expect(catalog.contracts[0]?.contractTag).toBe('contract-media@v0.3.0');
  });

  it('falls back to package.json version when info.version is blank', () => {
    const catalog = buildCatalog({
      generatedAt: 'sha',
      contracts: [
        makeContract({
          id: 'lists',
          packageVersion: '0.2.0',
          snapshot: { info: { title: 'Lists', version: '   ' } },
        }),
      ],
    });

    expect(catalog.contracts[0]?.version).toBe('0.2.0');
  });

  it('emits one openapi path per contract id', () => {
    const catalog = buildCatalog({
      generatedAt: 'sha',
      contracts: [
        makeContract({ id: 'finance' }),
        makeContract({ id: 'media' }),
        makeContract({ id: 'inventory' }),
      ],
    });

    expect(catalog.contracts.map((c) => c.openapiPath)).toEqual([
      '/openapi/finance.json',
      '/openapi/media.json',
      '/openapi/inventory.json',
    ]);
  });
});
