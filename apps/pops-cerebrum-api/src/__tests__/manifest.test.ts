import { describe, expect, it } from 'vitest';

import { cerebrumManifest, egoManifest } from '@pops/cerebrum-contract/settings';
import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildCerebrumManifest, CEREBRUM_PILLAR_ID } from '../manifest.js';

describe('buildCerebrumManifest', () => {
  it('produces a payload that passes the central manifest schema', () => {
    const manifest = buildCerebrumManifest('0.1.0');
    const parsed = ManifestPayloadSchema.parse(manifest);
    expect(parsed.pillar).toBe(CEREBRUM_PILLAR_ID);
    expect(parsed.contract.package).toBe('@pops/cerebrum-contract');
    expect(parsed.contract.tag).toBe('contract-cerebrum@v0.1.0');
  });

  it('passes the full cross-field validator', () => {
    const result = validateManifestPayload(buildCerebrumManifest('0.1.0'));
    expect(result.ok).toBe(true);
  });

  it('declares both cerebrum and ego settings manifests on the settings dimension (PRD-240 US-03)', () => {
    const manifest = buildCerebrumManifest('0.1.0');
    expect(manifest.settings?.manifests.map((m) => m.id)).toEqual([
      cerebrumManifest.id,
      egoManifest.id,
    ]);
  });

  it('forwards the cerebrum and ego descriptors verbatim from the contract package', () => {
    const manifest = buildCerebrumManifest('0.1.0');
    const [cerebrumDescriptor, egoDescriptor] = manifest.settings?.manifests ?? [];
    expect(cerebrumDescriptor).toEqual(cerebrumManifest);
    expect(egoDescriptor).toEqual(egoManifest);
  });

  it('the two declared settings manifests carry distinct ids', () => {
    const manifest = buildCerebrumManifest('0.1.0');
    const ids = manifest.settings?.manifests.map((m) => m.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('serialises through JSON without losing the settings dimension', () => {
    const manifest = buildCerebrumManifest('0.1.0');
    const roundTripped: unknown = JSON.parse(JSON.stringify(manifest));
    const parsed = ManifestPayloadSchema.parse(roundTripped);
    expect(parsed.settings?.manifests).toHaveLength(2);
  });

  it('rejects non-semver versions at the schema boundary', () => {
    expect(() => ManifestPayloadSchema.parse(buildCerebrumManifest('not-a-semver'))).toThrow();
  });

  describe('PRD-243 US-02 nav + pages dimensions', () => {
    it('declares a nav block matching the shell-side cerebrum navConfig', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      expect(manifest.nav?.id).toBe('cerebrum');
      expect(manifest.nav?.basePath).toBe('/cerebrum');
      expect(manifest.nav?.icon).toBe('book-open');
      expect(manifest.nav?.color).toBe('sky');
      expect(manifest.nav?.order).toBe(60);
    });

    it('mirrors the shell-side nav item count + paths (no drift)', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      const paths = manifest.nav?.items.map((i) => i.path) ?? [];
      expect(paths).toEqual([
        '',
        '/engrams',
        '/query',
        '/documents',
        '/nudges',
        '/proposals',
        '/glia',
        '/reflex',
        '/plexus',
      ]);
    });

    it('rewrites every nav icon as a kebab-case wire identifier', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      const icons = [manifest.nav?.icon, ...(manifest.nav?.items.map((i) => i.icon) ?? [])].filter(
        (v): v is string => typeof v === 'string'
      );
      for (const icon of icons) {
        expect(icon).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });

    it('declares a pages descriptor for every cerebrum route surface', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      const paths = manifest.pages?.map((p) => p.path) ?? [];
      expect(paths).toEqual([
        '',
        'chat',
        'nudges',
        'proposals',
        'engrams',
        'engrams/:id',
        'documents',
        'query',
        'reflex',
        'reflex/:name',
        'plexus',
        'plexus/:adapterId',
        'glia',
      ]);
    });

    it('flags the index page (and only the index page)', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      const indexes = manifest.pages?.filter((p) => p.index === true) ?? [];
      expect(indexes).toHaveLength(1);
      expect(indexes[0]?.bundleSlot).toBe('cerebrum-ingest');
    });

    it('gives every page a unique kebab-case bundleSlot', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      const slots = manifest.pages?.map((p) => p.bundleSlot) ?? [];
      expect(new Set(slots).size).toBe(slots.length);
      for (const slot of slots) {
        expect(slot).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
    });

    it('does NOT declare assetsBaseUrl (deferred to US-05)', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      expect(manifest.assetsBaseUrl).toBeUndefined();
    });

    it('round-trips the nav + pages dimensions through JSON', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      const roundTripped: unknown = JSON.parse(JSON.stringify(manifest));
      const parsed = ManifestPayloadSchema.parse(roundTripped);
      expect(parsed.nav?.id).toBe('cerebrum');
      expect(parsed.pages?.length).toBeGreaterThan(0);
    });
  });

  describe('PRD-246 US-02 captureOverlay dimension', () => {
    it('declares a captureOverlay block resolving to cerebrum IngestForm', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      expect(manifest.captureOverlay).toEqual({
        bundleSlot: 'ingest-form',
        order: 10,
        hotkey: 'cmd+shift+k',
        labelKey: 'cerebrum.captureOverlay.label',
      });
    });

    it('passes ManifestPayloadSchema with the captureOverlay dimension present', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      const parsed = ManifestPayloadSchema.parse(manifest);
      expect(parsed.captureOverlay?.bundleSlot).toBe('ingest-form');
    });

    it('round-trips the captureOverlay dimension through JSON', () => {
      const manifest = buildCerebrumManifest('0.1.0');
      const roundTripped: unknown = JSON.parse(JSON.stringify(manifest));
      const parsed = ManifestPayloadSchema.parse(roundTripped);
      expect(parsed.captureOverlay?.hotkey).toBe('cmd+shift+k');
      expect(parsed.captureOverlay?.order).toBe(10);
    });
  });
});
