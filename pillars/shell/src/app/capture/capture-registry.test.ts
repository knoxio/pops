import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  rankCaptureOverlays,
  resolveCaptureOverlay,
  selectActiveCaptureOverlay,
  warnOnDuplicateHotkeys,
} from './capture-registry';

/**
 * Unit tests for the capture-overlay registry walk. Exercises the
 * selection rule (sort by order, tiebreak by pillarId) and the
 * bundle-map resolution edge cases (no overlay registered, unknown
 * bundleSlot).
 */
import type { ComponentType } from 'react';

import type { ModuleCaptureOverlayConfig } from '@pops/types';

import type { BundleEntry, CaptureOverlayBundle, CaptureOverlayMountProps } from '../bundle-map';
import type { FrontendManifest } from '../installed-modules';

const FakeMount: ComponentType<CaptureOverlayMountProps> = () => null;
const fakeBundle: CaptureOverlayBundle = { Mount: FakeMount };

function manifest(
  id: string,
  captureOverlay: ModuleCaptureOverlayConfig | undefined
): FrontendManifest {
  return {
    id,
    name: `${id} (synthetic)`,
    surfaces: ['app'],
    frontend: captureOverlay !== undefined ? { captureOverlay } : {},
  };
}

function entry(
  pillarId: string,
  bundles: Readonly<Record<string, CaptureOverlayBundle>> | undefined
): BundleEntry {
  return {
    manifest: { id: pillarId, name: pillarId, surfaces: ['app'] },
    navOrder: 10,
    captureOverlayBundles: bundles,
  };
}

describe('rankCaptureOverlays', () => {
  it('returns an empty list when no manifest contributes a captureOverlay', () => {
    const ranked = rankCaptureOverlays([
      manifest('finance', undefined),
      manifest('media', undefined),
    ]);
    expect(ranked).toEqual([]);
  });

  it('filters out manifests with no descriptor and keeps the rest', () => {
    const ranked = rankCaptureOverlays([
      manifest('finance', undefined),
      manifest('cerebrum', { bundleSlot: 'ingest-form', order: 10 }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.pillarId).toBe('cerebrum');
  });

  it('sorts ascending by descriptor.order', () => {
    const ranked = rankCaptureOverlays([
      manifest('lists', { bundleSlot: 'list-quick-add', order: 30 }),
      manifest('cerebrum', { bundleSlot: 'ingest-form', order: 10 }),
      manifest('finance', { bundleSlot: 'tx-quick-add', order: 20 }),
    ]);
    expect(ranked.map((r) => r.pillarId)).toEqual(['cerebrum', 'finance', 'lists']);
  });

  it('breaks ties alphabetically by pillar id', () => {
    const ranked = rankCaptureOverlays([
      manifest('lists', { bundleSlot: 'list-quick-add', order: 10 }),
      manifest('cerebrum', { bundleSlot: 'ingest-form', order: 10 }),
      manifest('finance', { bundleSlot: 'tx-quick-add', order: 10 }),
    ]);
    expect(ranked.map((r) => r.pillarId)).toEqual(['cerebrum', 'finance', 'lists']);
  });
});

describe('resolveCaptureOverlay', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns the bundle when the bundleSlot resolves', () => {
    const map = {
      cerebrum: entry('cerebrum', { 'ingest-form': fakeBundle }),
    };
    const resolved = resolveCaptureOverlay(
      {
        pillarId: 'cerebrum',
        descriptor: { bundleSlot: 'ingest-form', order: 10 },
      },
      map
    );
    expect(resolved).not.toBeNull();
    expect(resolved?.bundle).toBe(fakeBundle);
  });

  it('logs a structured warning and returns null when the pillar entry is missing', () => {
    const resolved = resolveCaptureOverlay(
      {
        pillarId: 'ghost',
        descriptor: { bundleSlot: 'ingest-form', order: 10 },
      },
      {}
    );
    expect(resolved).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown capture overlay bundleSlot; skipping mount')
    );
  });

  it('logs a structured warning and returns null when the bundleSlot is not bound', () => {
    const map = {
      cerebrum: entry('cerebrum', { 'other-slot': fakeBundle }),
    };
    const resolved = resolveCaptureOverlay(
      {
        pillarId: 'cerebrum',
        descriptor: { bundleSlot: 'ingest-form', order: 10 },
      },
      map
    );
    expect(resolved).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown capture overlay bundleSlot; skipping mount')
    );
  });

  it('logs a structured warning when the pillar entry omits captureOverlayBundles', () => {
    const map = {
      cerebrum: entry('cerebrum', undefined),
    };
    const resolved = resolveCaptureOverlay(
      {
        pillarId: 'cerebrum',
        descriptor: { bundleSlot: 'ingest-form', order: 10 },
      },
      map
    );
    expect(resolved).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('selectActiveCaptureOverlay', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns null and logs the no-overlay message when no manifest contributes', () => {
    const overlay = selectActiveCaptureOverlay([manifest('finance', undefined)], {});
    expect(overlay).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[capture-registry] no capture overlay registered');
  });

  it('returns the head of the ranked list when an overlay resolves', () => {
    const map = {
      cerebrum: entry('cerebrum', { 'ingest-form': fakeBundle }),
    };
    const overlay = selectActiveCaptureOverlay(
      [manifest('cerebrum', { bundleSlot: 'ingest-form', order: 10, hotkey: 'cmd+shift+k' })],
      map
    );
    expect(overlay?.pillarId).toBe('cerebrum');
    expect(overlay?.descriptor.hotkey).toBe('cmd+shift+k');
    expect(overlay?.bundle).toBe(fakeBundle);
  });

  it('returns null when the head descriptor cannot resolve against the bundle map', () => {
    const overlay = selectActiveCaptureOverlay(
      [manifest('cerebrum', { bundleSlot: 'ingest-form', order: 10 })],
      {}
    );
    expect(overlay).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown capture overlay bundleSlot; skipping mount')
    );
  });
});

describe('warnOnDuplicateHotkeys', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does not warn when every hotkey is unique', () => {
    warnOnDuplicateHotkeys([
      { pillarId: 'cerebrum', descriptor: { bundleSlot: 'a', order: 10, hotkey: 'cmd+shift+k' } },
      { pillarId: 'finance', descriptor: { bundleSlot: 'b', order: 20, hotkey: 'cmd+shift+j' } },
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns once per hotkey shared by two or more pillars', () => {
    warnOnDuplicateHotkeys([
      { pillarId: 'cerebrum', descriptor: { bundleSlot: 'a', order: 10, hotkey: 'cmd+shift+k' } },
      { pillarId: 'finance', descriptor: { bundleSlot: 'b', order: 20, hotkey: 'cmd+shift+k' } },
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`duplicate captureOverlay hotkey 'cmd+shift+k'`)
    );
  });

  it('ignores descriptors with no hotkey', () => {
    warnOnDuplicateHotkeys([
      { pillarId: 'cerebrum', descriptor: { bundleSlot: 'a', order: 10 } },
      { pillarId: 'finance', descriptor: { bundleSlot: 'b', order: 20 } },
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
