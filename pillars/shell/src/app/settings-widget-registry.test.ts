import { describe, expect, it, vi } from 'vitest';

import { resolveSettingsWidgetsFrom } from './settings-widget-registry';

import type { ComponentType } from 'react';

import type { ModuleManifest, SettingsManifest } from '@pops/types';

import type { BundleEntry } from './bundle-entry';

const Widget: ComponentType = () => null;
const OtherWidget: ComponentType = () => null;

const stubManifest: ModuleManifest = { id: 'media', name: 'Media', surfaces: ['app'] };

function entry(settingsWidgetBundles?: Record<string, ComponentType>): BundleEntry {
  return { manifest: stubManifest, navOrder: 20, settingsWidgetBundles };
}

function section(...groups: SettingsManifest['groups']): SettingsManifest {
  return { id: 'media.plex', title: 'Plex', order: 100, groups };
}

describe('resolveSettingsWidgetsFrom', () => {
  it('resolves a declared slot against the owning pillar entry', () => {
    const resolved = resolveSettingsWidgetsFrom(
      section({
        id: 'account',
        title: 'Account',
        widget: { bundleSlot: 'plex-connect' },
        fields: [],
      }),
      'media',
      { media: entry({ 'plex-connect': Widget }) }
    );

    expect(resolved).toEqual({ 'plex-connect': Widget });
  });

  it('resolves every declared slot across groups', () => {
    const resolved = resolveSettingsWidgetsFrom(
      section(
        { id: 'a', title: 'A', widget: { bundleSlot: 'one' }, fields: [] },
        { id: 'b', title: 'B', widget: { bundleSlot: 'two' }, fields: [] }
      ),
      'media',
      { media: entry({ one: Widget, two: OtherWidget }) }
    );

    expect(resolved).toEqual({ one: Widget, two: OtherWidget });
  });

  it('returns an empty record when no group declares a slot', () => {
    const resolved = resolveSettingsWidgetsFrom(
      section({ id: 'connection', title: 'Connection', fields: [] }),
      'media',
      { media: entry({ 'plex-connect': Widget }) }
    );

    expect(resolved).toEqual({});
  });

  it('warns and omits a slot the owning pillar does not bind', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = resolveSettingsWidgetsFrom(
      section({
        id: 'account',
        title: 'Account',
        widget: { bundleSlot: 'plex-connect' },
        fields: [],
      }),
      'media',
      { media: entry({ 'something-else': Widget }) }
    );

    expect(resolved).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('plex-connect'));
    warn.mockRestore();
  });

  it('does not resolve a slot bound by a DIFFERENT pillar', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = resolveSettingsWidgetsFrom(
      section({
        id: 'account',
        title: 'Account',
        widget: { bundleSlot: 'plex-connect' },
        fields: [],
      }),
      'media',
      { finance: entry({ 'plex-connect': Widget }), media: entry() }
    );

    expect(resolved).toEqual({});
    warn.mockRestore();
  });

  it('warns and omits when the pillar has no bundle map entry at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = resolveSettingsWidgetsFrom(
      section({
        id: 'account',
        title: 'Account',
        widget: { bundleSlot: 'plex-connect' },
        fields: [],
      }),
      'nosuch',
      {}
    );

    expect(resolved).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nosuch'));
    warn.mockRestore();
  });
});
