import { describe, expect, it } from 'vitest';

/**
 * Frontend module-install filter tests (PRD-101 US-06).
 *
 * Validates the defence-in-depth gate that drops search result sections
 * whose owning module isn't part of the build's installed set. The backend
 * engine is the primary filter; this hook prevents stale or
 * misconfigured payloads from rendering links into uninstalled apps.
 */
import { ALL_MODULE_IDS } from '@pops/pillar-sdk';

import { isInstalledModule } from './installed-module';

describe('isInstalledModule', () => {
  it('treats registry as always installed (it is the platform module, formerly core)', () => {
    expect(isInstalledModule('registry')).toBe(true);
  });

  it('returns true for every id in the canonical ALL_MODULE_IDS set', () => {
    for (const id of ALL_MODULE_IDS) {
      expect(isInstalledModule(id)).toBe(true);
    }
  });

  it('returns false for unknown ids — the absent-module case the engine should never emit', () => {
    expect(isInstalledModule('nonexistent-module')).toBe(false);
    expect(isInstalledModule('')).toBe(false);
    expect(isInstalledModule('Finance')).toBe(false); // case-sensitive
  });
});
