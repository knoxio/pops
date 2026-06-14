/**
 * Manifest payload tests for the media pillar (PRD-240 US-03).
 *
 * Asserts that `buildMediaManifest` produces a payload that:
 *   1. Validates against `ManifestPayloadSchema` (the wire schema bumped
 *      in US-01).
 *   2. Declares `settings.manifests` with exactly the four media
 *      sub-domain manifests (`arr`, `plex`, `rotation`,
 *      `media-operational`) — sourced from the
 *      `@pops/media-contract/settings` subpath.
 *   3. Has unique manifest ids — duplicate ids surface as a clear error.
 */
import { describe, expect, it } from 'vitest';

import {
  arrManifest,
  mediaOperationalManifest,
  plexManifest,
  rotationManifest,
} from '@pops/media-contract/settings';
import { ManifestPayloadSchema } from '@pops/pillar-sdk/manifest-schema';

import { buildMediaManifest } from '../manifest.js';

describe('buildMediaManifest', () => {
  it('validates against ManifestPayloadSchema', () => {
    const payload = buildMediaManifest('0.1.0');
    const result = ManifestPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('declares the four media settings manifests in order', () => {
    const payload = buildMediaManifest('0.1.0');
    expect(payload.settings).toBeDefined();
    expect(payload.settings?.manifests).toEqual([
      arrManifest,
      plexManifest,
      rotationManifest,
      mediaOperationalManifest,
    ]);
  });

  it('contains no duplicate settings manifest ids', () => {
    const payload = buildMediaManifest('0.1.0');
    const ids = payload.settings?.manifests.map((m) => m.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('serialises and round-trips through JSON without losing the settings block', () => {
    const payload = buildMediaManifest('0.1.0');
    const roundTripped: unknown = JSON.parse(JSON.stringify(payload));
    const result = ManifestPayloadSchema.safeParse(roundTripped);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.settings?.manifests.map((m) => m.id)).toEqual([
        arrManifest.id,
        plexManifest.id,
        rotationManifest.id,
        mediaOperationalManifest.id,
      ]);
    }
  });

  describe('PRD-243 US-02 nav + pages dimensions', () => {
    it('declares a nav block matching the shell-side media navConfig', () => {
      const payload = buildMediaManifest('0.1.0');
      expect(payload.nav?.id).toBe('media');
      expect(payload.nav?.basePath).toBe('/media');
      expect(payload.nav?.icon).toBe('film');
      expect(payload.nav?.color).toBe('indigo');
      expect(payload.nav?.order).toBe(200);
    });

    it('mirrors the shell-side nav item count + paths (no drift)', () => {
      const payload = buildMediaManifest('0.1.0');
      expect(payload.nav?.items.map((i) => i.path)).toEqual([
        '',
        '/watchlist',
        '/history',
        '/discover',
        '/rankings',
        '/search',
        '/compare',
        '/tier-list',
      ]);
    });

    it('rewrites every nav icon as a kebab-case wire identifier', () => {
      const payload = buildMediaManifest('0.1.0');
      const icons = [payload.nav?.icon, ...(payload.nav?.items.map((i) => i.icon) ?? [])].filter(
        (v): v is string => typeof v === 'string'
      );
      for (const icon of icons) {
        expect(icon).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });

    it('declares a pages descriptor for every media route surface', () => {
      const payload = buildMediaManifest('0.1.0');
      const paths = payload.pages?.map((p) => p.path) ?? [];
      expect(paths).toContain('');
      expect(paths).toContain('movies/:id');
      expect(paths).toContain('tv/:id/season/:num');
      expect(paths).toContain('debrief/:movieId/results');
      expect(paths).toContain('plex');
      expect(paths).toContain('rotation/candidates');
    });

    it('flags the index page (and only the index page)', () => {
      const payload = buildMediaManifest('0.1.0');
      const indexes = payload.pages?.filter((p) => p.index === true) ?? [];
      expect(indexes).toHaveLength(1);
      expect(indexes[0]?.bundleSlot).toBe('media-library');
    });

    it('gives every page a unique kebab-case bundleSlot', () => {
      const payload = buildMediaManifest('0.1.0');
      const slots = payload.pages?.map((p) => p.bundleSlot) ?? [];
      expect(new Set(slots).size).toBe(slots.length);
      for (const slot of slots) {
        expect(slot).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });

    it('does NOT declare assetsBaseUrl (deferred to US-05)', () => {
      const payload = buildMediaManifest('0.1.0');
      expect(payload.assetsBaseUrl).toBeUndefined();
    });

    it('round-trips the nav + pages dimensions through JSON', () => {
      const payload = buildMediaManifest('0.1.0');
      const roundTripped: unknown = JSON.parse(JSON.stringify(payload));
      const parsed = ManifestPayloadSchema.parse(roundTripped);
      expect(parsed.nav?.id).toBe('media');
      expect(parsed.pages?.length).toBeGreaterThan(0);
    });
  });
});
