import { describe, expect, it } from 'vitest';

import { DEFAULT_REGISTRY_URL, resolveRegistryUrl } from './registry-url-env.ts';

describe('resolveRegistryUrl', () => {
  it('returns the default when neither env var is set', () => {
    expect(resolveRegistryUrl({})).toBe(DEFAULT_REGISTRY_URL);
  });

  it('prefers POPS_REGISTRY_URL (the repo-wide convention)', () => {
    expect(
      resolveRegistryUrl({
        POPS_REGISTRY_URL: 'http://pops:1111',
        CORE_REGISTRY_URL: 'http://core:2222',
      })
    ).toBe('http://pops:1111');
  });

  it('falls back to legacy CORE_REGISTRY_URL when POPS_REGISTRY_URL is absent', () => {
    expect(resolveRegistryUrl({ CORE_REGISTRY_URL: 'http://core:2222' })).toBe('http://core:2222');
  });

  it('ignores an empty POPS_REGISTRY_URL and falls through', () => {
    expect(
      resolveRegistryUrl({ POPS_REGISTRY_URL: '', CORE_REGISTRY_URL: 'http://core:2222' })
    ).toBe('http://core:2222');
  });

  it('ignores empty values entirely and returns the default', () => {
    expect(resolveRegistryUrl({ POPS_REGISTRY_URL: '', CORE_REGISTRY_URL: '' })).toBe(
      DEFAULT_REGISTRY_URL
    );
  });
});
