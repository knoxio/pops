import { describe, expect, it } from 'vitest';

import { assertModuleManifest } from '@pops/types';

import { financeManifest } from '../manifest.js';

describe('finance-contract /manifest — ModuleManifest export (PRD-241 US-01)', () => {
  it('financeManifest passes assertModuleManifest with id=finance', () => {
    expect(() => assertModuleManifest(financeManifest, 'modules.finance')).not.toThrow();
    expect(financeManifest.id).toBe('finance');
    expect(financeManifest.name).toBe('Finance');
    expect(financeManifest.surfaces).toEqual(['app']);
  });

  it('financeManifest contributes the finance settings section', () => {
    const sectionIds = (financeManifest.settings ?? []).map((s) => s.id);
    expect(sectionIds).toEqual(['finance']);
  });
});
