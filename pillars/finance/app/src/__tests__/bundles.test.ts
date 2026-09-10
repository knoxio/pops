import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import { FINANCE_PAGES } from '@pops/finance/manifest';

import { bundles } from '../bundles';
import { routes } from '../routes';

/**
 * The shell's loader looks a `PageDescriptor.bundleSlot` up in this record and
 * throws when it is absent, so a slot the pillar advertises and the bundle
 * does not carry is a page that fails to mount for whoever navigates there
 * first. Both directions matter: an orphan component is dead weight, a slot
 * with nothing behind it is a dead link.
 */
describe('finance bundles record', () => {
  it('carries exactly the slots the pillar manifest advertises', () => {
    const declared = FINANCE_PAGES.map((page) => page.bundleSlot).toSorted();
    expect(Object.keys(bundles).toSorted()).toEqual(declared);
  });

  it('resolves every slot to a component', () => {
    for (const slot of Object.keys(bundles)) {
      const component = bundles[slot as keyof typeof bundles];
      expect(component, slot).toBeDefined();
      expect(['function', 'object'], slot).toContain(typeof component);
    }
  });

  // The two mount paths must agree about which component a page is, and the
  // route table spells its paths out rather than deriving them (the title-icon
  // gate parses them), so this is where the two are held in step. Comparing
  // identities rather than counts is what makes that hold: four slots and four
  // components can still be four wrong pairings.
  it('binds each slot to the component the route table mounts at that path', () => {
    for (const page of FINANCE_PAGES) {
      const route = routes.find((candidate) =>
        'index' in page && page.index ? candidate.index === true : candidate.path === page.path
      );
      if (route === undefined) throw new Error(`no route for page '${page.path}'`);
      const element = route.element;
      if (!isValidElement(element)) throw new Error(`route ${page.bundleSlot} has no element`);
      expect(element.type, page.bundleSlot).toBe(bundles[page.bundleSlot]);
    }
  });

  it('binds a distinct component to every slot', () => {
    expect(new Set(Object.values(bundles)).size).toBe(FINANCE_PAGES.length);
  });

  // The routes and the slots describe one surface, with nothing on either
  // side the other lacks. A route with no page descriptor behind it does not
  // exist for a loader-mounted pillar — it is mounted from `pages` alone —
  // and the order-detail route is the one that would have gone missing
  // quietly, since no nav item points at it to look broken.
  it('covers every route the pillar mounts, and only those', () => {
    expect(routes).toHaveLength(FINANCE_PAGES.length);
  });

  // The six pages that would have gone missing when finance moved onto the
  // loader: none is reached from the rail, so none would have looked broken
  // from the rail while all of them 404'd. Named individually rather than
  // counted, because a count passes while the wrong six are present.
  it.each([
    'finance-entity-detail',
    'finance-accounts',
    'finance-account-detail',
    'finance-account-checkpoints',
    'finance-account-imports',
    'finance-tag-rules',
    'finance-settings',
  ])('carries %s, which no nav item reaches', (slot) => {
    expect(Object.keys(bundles)).toContain(slot);
  });

  it('carries a slot for every route the app mounts', () => {
    expect(Object.keys(bundles)).toHaveLength(routes.length);
  });
});
