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
});
