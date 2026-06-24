/**
 * Manifest payload tests for the lists pillar.
 *
 * Verify `buildListsManifest` passes the central wire schema AND carries the
 * `nav` + `pages` UI dimensions the shell consumes to render the lists module.
 */
import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildListsManifest, LISTS_PILLAR_ID } from '../manifest.js';

describe('buildListsManifest', () => {
  it('produces a payload that passes the central manifest schema', () => {
    const manifest = buildListsManifest('0.1.0');
    const parsed = ManifestPayloadSchema.parse(manifest);
    expect(parsed.pillar).toBe(LISTS_PILLAR_ID);
    expect(parsed.contract.package).toBe('@pops/lists');
    expect(parsed.contract.tag).toBe('contract-lists@v0.1.0');
  });

  it('passes the full cross-field validator', () => {
    const result = validateManifestPayload(buildListsManifest('0.1.0'));
    expect(result.ok).toBe(true);
  });

  it('declares no settings dimension today (no lists settings ship yet)', () => {
    const manifest = buildListsManifest('0.1.0');
    expect(manifest.settings).toBeUndefined();
  });

  it('rejects non-semver versions at the schema boundary', () => {
    expect(() => ManifestPayloadSchema.parse(buildListsManifest('not-a-semver'))).toThrow();
  });

  describe('nav + pages dimensions', () => {
    it('declares a nav block matching the shell-side lists navConfig', () => {
      const manifest = buildListsManifest('0.1.0');
      expect(manifest.nav?.id).toBe('lists');
      expect(manifest.nav?.basePath).toBe('/lists');
      expect(manifest.nav?.icon).toBe('list-checks');
      expect(manifest.nav?.color).toBe('sky');
      expect(manifest.nav?.order).toBe(50);
    });

    it('mirrors the shell-side nav item count + paths (home only, no deep links)', () => {
      const manifest = buildListsManifest('0.1.0');
      expect(manifest.nav?.items.map((i) => i.path)).toEqual(['']);
    });

    it('rewrites every nav icon as a kebab-case wire identifier', () => {
      const manifest = buildListsManifest('0.1.0');
      const icons = [manifest.nav?.icon, ...(manifest.nav?.items.map((i) => i.icon) ?? [])].filter(
        (v): v is string => typeof v === 'string'
      );
      for (const icon of icons) {
        expect(icon).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });

    it('declares a pages descriptor for the index and the detail deep link', () => {
      const manifest = buildListsManifest('0.1.0');
      const paths = manifest.pages?.map((p) => p.path) ?? [];
      expect(paths).toEqual(['', ':id']);
    });

    it('flags the index page (and only the index page)', () => {
      const manifest = buildListsManifest('0.1.0');
      const indexes = manifest.pages?.filter((p) => p.index === true) ?? [];
      expect(indexes).toHaveLength(1);
      expect(indexes[0]?.bundleSlot).toBe('lists-index');
    });

    it('gives every page a unique kebab-case bundleSlot', () => {
      const manifest = buildListsManifest('0.1.0');
      const slots = manifest.pages?.map((p) => p.bundleSlot) ?? [];
      expect(new Set(slots).size).toBe(slots.length);
      for (const slot of slots) {
        expect(slot).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });

    it('does NOT declare assetsBaseUrl', () => {
      const manifest = buildListsManifest('0.1.0');
      expect(manifest.assetsBaseUrl).toBeUndefined();
    });

    it('round-trips the nav + pages dimensions through JSON', () => {
      const manifest = buildListsManifest('0.1.0');
      const roundTripped: unknown = JSON.parse(JSON.stringify(manifest));
      const parsed = ManifestPayloadSchema.parse(roundTripped);
      expect(parsed.nav?.id).toBe('lists');
      expect(parsed.pages?.length).toBe(2);
    });
  });
});
