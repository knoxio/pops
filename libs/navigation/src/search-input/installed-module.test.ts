import { describe, expect, it } from 'vitest';

import { KNOWN_MODULES } from '@pops/module-registry';

/**
 * Frontend module-install filter tests (PRD-101 US-06).
 *
 * Validates the defence-in-depth gate that drops search result sections
 * whose owning module isn't part of the build's installed set. The backend
 * engine is the primary filter; this hook prevents stale or
 * misconfigured payloads from rendering links into uninstalled apps.
 *
 * RD-9 re-homed the filter off the SDK's frozen `ALL_MODULE_IDS` onto
 * `@pops/module-registry`'s runtime install set, so these assertions check
 * membership of `KNOWN_MODULES` (the disk-discovered superset) rather than the
 * retired SDK tuple. With env unset (the test default) the install set is
 * `KNOWN_MODULES` verbatim.
 */
import { isInstalledModule } from './installed-module';

describe('isInstalledModule', () => {
  it('treats registry as always installed (it is the platform module, formerly core)', () => {
    expect(isInstalledModule('registry')).toBe(true);
  });

  it('returns true for every id in the build install set (KNOWN_MODULES)', () => {
    for (const id of KNOWN_MODULES) {
      expect(isInstalledModule(id)).toBe(true);
    }
  });

  it('returns false for unknown ids — the absent-module case the engine should never emit', () => {
    expect(isInstalledModule('nonexistent-module')).toBe(false);
    expect(isInstalledModule('')).toBe(false);
    expect(isInstalledModule('Finance')).toBe(false); // case-sensitive
  });

  it('returns false for contacts — a Rust pillar with no installed frontend/search surface', () => {
    // `contacts` is in the SDK's old ALL_MODULE_IDS but NOT in KNOWN_MODULES
    // (no TS manifest), so it has no search adapter the shell could mount. The
    // re-homed filter correctly rejects a stray `contacts` section.
    expect(isInstalledModule('contacts')).toBe(false);
  });
});
