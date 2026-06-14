/**
 * Manifest payload tests for the food pillar (PRD-243 US-02).
 *
 * `buildFoodManifest` was extracted from `server.ts` so the new `nav`
 * and `pages` UI dimensions live next to the existing payload fields.
 * These tests verify the payload still passes the wire schema AND
 * carries the nav + pages descriptors expected by PRD-243's shell
 * rewrite (US-03).
 */
import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildFoodManifest, FOOD_PILLAR_ID } from '../manifest.js';

describe('buildFoodManifest', () => {
  it('produces a payload that passes the central manifest schema', () => {
    const manifest = buildFoodManifest('0.1.0');
    const parsed = ManifestPayloadSchema.parse(manifest);
    expect(parsed.pillar).toBe(FOOD_PILLAR_ID);
    expect(parsed.contract.package).toBe('@pops/food-contract');
    expect(parsed.contract.tag).toBe('contract-food@v0.1.0');
  });

  it('passes the full cross-field validator', () => {
    const result = validateManifestPayload(buildFoodManifest('0.1.0'));
    expect(result.ok).toBe(true);
  });

  it('declares no settings dimension today (no food settings ship yet)', () => {
    const manifest = buildFoodManifest('0.1.0');
    expect(manifest.settings).toBeUndefined();
  });

  it('rejects non-semver versions at the schema boundary', () => {
    expect(() => ManifestPayloadSchema.parse(buildFoodManifest('not-a-semver'))).toThrow();
  });

  describe('PRD-243 US-02 nav + pages dimensions', () => {
    it('declares a nav block matching the shell-side food navConfig', () => {
      const manifest = buildFoodManifest('0.1.0');
      expect(manifest.nav?.id).toBe('food');
      expect(manifest.nav?.basePath).toBe('/food');
      expect(manifest.nav?.icon).toBe('utensils');
      expect(manifest.nav?.color).toBe('amber');
      expect(manifest.nav?.order).toBe(40);
    });

    it('mirrors the shell-side nav item count + paths (no drift)', () => {
      const manifest = buildFoodManifest('0.1.0');
      expect(manifest.nav?.items.map((i) => i.path)).toEqual([
        '',
        '/recipes',
        '/inbox',
        '/plan',
        '/fridge',
        '/solve',
        '/shopping/from-plan',
        '/data',
        '/prompts',
      ]);
    });

    it('rewrites every nav icon as a kebab-case wire identifier', () => {
      const manifest = buildFoodManifest('0.1.0');
      const icons = [manifest.nav?.icon, ...(manifest.nav?.items.map((i) => i.icon) ?? [])].filter(
        (v): v is string => typeof v === 'string'
      );
      for (const icon of icons) {
        expect(icon).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });

    it('declares one descriptor for the index route and one per data tab', () => {
      const manifest = buildFoodManifest('0.1.0');
      const paths = manifest.pages?.map((p) => p.path) ?? [];
      expect(paths).toContain('');
      expect(paths).toContain('data');
      expect(paths).toContain('data/ingredients');
      expect(paths).toContain('data/aliases');
      expect(paths).toContain('data/prep-states');
      expect(paths).toContain('data/substitutions');
      expect(paths).toContain('data/substitutions/graph');
      expect(paths).toContain('data/conversions');
      expect(paths).toContain('data/tags');
    });

    it('flags the index page (and only the index page)', () => {
      const manifest = buildFoodManifest('0.1.0');
      const indexes = manifest.pages?.filter((p) => p.index === true) ?? [];
      expect(indexes).toHaveLength(1);
      expect(indexes[0]?.bundleSlot).toBe('food-landing');
    });

    it('gives every page a unique kebab-case bundleSlot', () => {
      const manifest = buildFoodManifest('0.1.0');
      const slots = manifest.pages?.map((p) => p.bundleSlot) ?? [];
      expect(new Set(slots).size).toBe(slots.length);
      for (const slot of slots) {
        expect(slot).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });

    it('does NOT declare assetsBaseUrl (deferred to US-05)', () => {
      const manifest = buildFoodManifest('0.1.0');
      expect(manifest.assetsBaseUrl).toBeUndefined();
    });

    it('round-trips the nav + pages dimensions through JSON', () => {
      const manifest = buildFoodManifest('0.1.0');
      const roundTripped: unknown = JSON.parse(JSON.stringify(manifest));
      const parsed = ManifestPayloadSchema.parse(roundTripped);
      expect(parsed.nav?.id).toBe('food');
      expect(parsed.pages?.length).toBeGreaterThan(0);
    });
  });
});
