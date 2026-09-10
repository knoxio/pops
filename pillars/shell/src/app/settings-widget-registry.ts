import type { ComponentType } from 'react';

import type { SettingsManifest } from '@pops/types';

/**
 * Settings-widget registry walk.
 *
 * A settings group may name a `widget.bundleSlot` for a flow the declarative
 * field renderer cannot express — the Plex PIN handshake is the first. This
 * module resolves those slots against the per-pillar bundle records the loader
 * synthesizes from each remote bundle, mirroring `capture-registry`'s
 * `bundleSlot` resolution.
 *
 * Resolution is per-section: the shell knows which pillar OWNS a section, so a
 * slot only ever resolves against that pillar's own bundles. A slot no entry
 * maps logs a structured warning and is simply absent from the returned
 * record; `GroupRenderer` then falls back to rendering the group's fields
 * alone rather than failing the whole section.
 */
import type { BundleEntry } from './bundle-entry';

export type SettingsWidgetBundles = Readonly<Record<string, ComponentType>>;

/**
 * Resolve every `widget.bundleSlot` named by `manifest` against `pillarId`'s
 * entry in `bundleMap`. Exported with an injectable map for unit tests; the
 * live consumer is {@link resolveSettingsWidgets}.
 */
export function resolveSettingsWidgetsFrom(
  manifest: SettingsManifest,
  pillarId: string,
  bundleMap: Readonly<Record<string, BundleEntry>>
): SettingsWidgetBundles {
  const bundles = bundleMap[pillarId]?.settingsWidgetBundles;
  const resolved: Record<string, ComponentType> = {};
  for (const group of manifest.groups) {
    const slot = group.widget?.bundleSlot;
    if (slot === undefined) continue;
    const component = bundles?.[slot];
    if (component === undefined) {
      console.warn(
        `[settings-widget-registry] unknown settings widget bundleSlot; rendering fields only (pillarId=${pillarId}, sectionId=${manifest.id}, groupId=${group.id}, bundleSlot=${slot})`
      );
      continue;
    }
    resolved[slot] = component;
  }
  return resolved;
}
