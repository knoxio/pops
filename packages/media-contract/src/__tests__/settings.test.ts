import { describe, expect, it } from 'vitest';

import {
  arrManifest,
  mediaOperationalManifest,
  plexManifest,
  rotationManifest,
} from '../settings/index.js';

describe('media-contract settings manifests', () => {
  it('exposes arrManifest with id "media.arr"', () => {
    expect(arrManifest.id).toBe('media.arr');
    expect(arrManifest.groups.length).toBeGreaterThan(0);
  });

  it('exposes plexManifest with id "media.plex"', () => {
    expect(plexManifest.id).toBe('media.plex');
    expect(plexManifest.groups.length).toBeGreaterThan(0);
  });

  it('exposes rotationManifest with id "media.rotation"', () => {
    expect(rotationManifest.id).toBe('media.rotation');
    expect(rotationManifest.groups.length).toBeGreaterThan(0);
  });

  it('exposes mediaOperationalManifest with id "media.operational"', () => {
    expect(mediaOperationalManifest.id).toBe('media.operational');
    expect(mediaOperationalManifest.groups.length).toBeGreaterThan(0);
  });
});
