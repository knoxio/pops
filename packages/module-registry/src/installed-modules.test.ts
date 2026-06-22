import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.POPS_APPS;
  delete process.env.POPS_OVERLAYS;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

async function loadRegistry(): Promise<typeof import('./index.js')> {
  return import('./index.js');
}

describe('INSTALLED_MODULES (runtime install-set shim, PRD-218 US-01)', () => {
  it('equals KNOWN_MODULES when POPS_APPS and POPS_OVERLAYS are unset', async () => {
    const mod = await loadRegistry();
    expect([...mod.INSTALLED_MODULES]).toEqual([...mod.KNOWN_MODULES]);
  });

  it('filters to the POPS_APPS subset when set', async () => {
    process.env.POPS_APPS = 'finance,media';
    const mod = await loadRegistry();
    expect([...mod.INSTALLED_MODULES].toSorted()).toEqual(['finance', 'media', 'registry']);
  });

  it('always includes registry even when POPS_APPS excludes it', async () => {
    process.env.POPS_APPS = 'finance';
    const mod = await loadRegistry();
    expect(mod.INSTALLED_MODULES).toContain('registry');
    expect(mod.INSTALLED_MODULES).toContain('finance');
    expect(mod.INSTALLED_MODULES).not.toContain('media');
  });

  it('drops ids that are not in KNOWN_MODULES', async () => {
    process.env.POPS_APPS = 'finance,definitely-not-a-real-module';
    const mod = await loadRegistry();
    expect(mod.INSTALLED_MODULES).not.toContain('definitely-not-a-real-module');
    expect(mod.INSTALLED_MODULES).toContain('finance');
  });

  it('unions POPS_APPS with POPS_OVERLAYS', async () => {
    process.env.POPS_APPS = 'finance';
    process.env.POPS_OVERLAYS = 'ego';
    const mod = await loadRegistry();
    expect(mod.INSTALLED_MODULES).toContain('finance');
    expect(mod.INSTALLED_MODULES).toContain('ego');
  });

  it('treats whitespace-only POPS_APPS as empty (only registry remains)', async () => {
    process.env.POPS_APPS = '   ';
    const mod = await loadRegistry();
    expect([...mod.INSTALLED_MODULES]).toEqual(['registry']);
  });
});

describe('isInstalledModule (runtime install-set predicate, PRD-218 US-01)', () => {
  it('returns true for ids in the install set', async () => {
    process.env.POPS_APPS = 'finance';
    const mod = await loadRegistry();
    expect(mod.isInstalledModule('finance')).toBe(true);
    expect(mod.isInstalledModule('registry')).toBe(true);
  });

  it('returns false for ids excluded by POPS_APPS even when they are known at build time', async () => {
    process.env.POPS_APPS = 'finance';
    const mod = await loadRegistry();
    expect(mod.isInstalledModule('media')).toBe(false);
  });

  it('returns false for completely unknown ids', async () => {
    const mod = await loadRegistry();
    expect(mod.isInstalledModule('definitely-not-a-real-module')).toBe(false);
  });

  it('returns true for every KNOWN_MODULES id when env is unset', async () => {
    const mod = await loadRegistry();
    for (const id of mod.KNOWN_MODULES) {
      expect(mod.isInstalledModule(id)).toBe(true);
    }
  });
});
