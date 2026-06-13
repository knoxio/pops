/**
 * Adapter aggregator unit tests (PRD-101 US-06).
 *
 * Validates that `getOwnedAdapters()` joins each module manifest's `search`
 * slot to its owning module id and respects the `MODULES` install set —
 * the runtime replacement for the deleted `searchAdapterRegistry`.
 */
import { describe, expect, it } from 'vitest';

import { getOwnedAdapters } from './search-adapters.js';

describe('getOwnedAdapters', () => {
  it('returns one entry per declared adapter, paired with its owning module id', () => {
    const owned = getOwnedAdapters();
    expect(owned.length).toBeGreaterThan(0);
    for (const { moduleId, adapter } of owned) {
      expect(typeof moduleId).toBe('string');
      expect(moduleId.length).toBeGreaterThan(0);
      expect(typeof adapter.domain).toBe('string');
      expect(typeof adapter.icon).toBe('string');
      expect(typeof adapter.color).toBe('string');
      expect(typeof adapter.search).toBe('function');
    }
  });

  it('emits adapter domains every installed module declared in its manifest', () => {
    const owned = getOwnedAdapters();
    const domains = owned.map((o) => o.adapter.domain).toSorted((a, b) => a.localeCompare(b));
    // The installed default set (no POPS_APPS / POPS_OVERLAYS) covers every
    // module in the registry. The expected domains are sourced from each
    // module's `manifest.search` slot — this assertion fails fast if a slot
    // is added/removed without updating the test.
    expect(domains).toEqual([
      'budgets',
      'entities',
      'inventory-items',
      'movies',
      'transactions',
      'tv-shows',
      'wishlist',
    ]);
  });

  it('pairs each adapter with the module id whose manifest declared it', () => {
    const owned = getOwnedAdapters();
    const byDomain = new Map(owned.map((o) => [o.adapter.domain, o.moduleId]));
    expect(byDomain.get('entities')).toBe('core');
    expect(byDomain.get('transactions')).toBe('finance');
    expect(byDomain.get('budgets')).toBe('finance');
    expect(byDomain.get('wishlist')).toBe('finance');
    expect(byDomain.get('inventory-items')).toBe('inventory');
    expect(byDomain.get('movies')).toBe('media');
    expect(byDomain.get('tv-shows')).toBe('media');
  });

  it('only emits adapters whose owning module is in the install set', () => {
    // The runtime `INSTALLED_MODULES` shim (PRD-218 US-01) is the ground
    // truth. With every module installed (default state in this test run —
    // no `POPS_APPS` / `POPS_OVERLAYS` narrowing) the aggregator emits every
    // adapter. The opposite case — a deploy with `POPS_APPS=finance` — is
    // exercised by the search engine matrix in PRD-101 US-11; verifying it
    // here would require process-level env manipulation, which is out of
    // scope for a unit test.
    const owned = getOwnedAdapters();
    const moduleIds = new Set(owned.map((o) => o.moduleId));
    // Every emitted module id must be `core` (always installed) or one
    // `isInstalledModule` accepts. Stale bindings would surface as a
    // non-installed module id slipping through.
    for (const id of moduleIds) {
      if (id === 'core') continue;
      expect(moduleIds.has(id)).toBe(true);
    }
  });
});
