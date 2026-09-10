import { describe, expect, it } from 'vitest';

import { iconMap } from '@pops/navigation';

import { buildRegisteredAppsFromBundleMap } from './registry';

import type { BundleEntry } from '../bundle-entry';
import type { AppNavConfig } from './types';

/**
 * The app rail's invariants.
 *
 * These used to run over `registeredApps`, a constant built from the static
 * bundle map. POPS-3227 deleted that map, and with it the constant — every
 * rail entry is now synthesized from a pillar's wire manifest at boot. So the
 * subject is the projection itself, `buildRegisteredAppsFromBundleMap`, driven
 * over the shape boot hands it.
 *
 * The invariants are unchanged and still worth pinning: they are what makes
 * the rail render rather than silently degrade — an unmapped icon renders a
 * fallback letter, a duplicate basePath makes one pillar unreachable, and a
 * bare item path routes to the wrong place.
 */
function entry(id: string, order: number, items: AppNavConfig['items']): BundleEntry {
  return {
    navOrder: order,
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      surfaces: ['app'],
      frontend: {
        routes: [],
        navConfig: {
          id,
          label: id,
          labelKey: id,
          icon: 'Compass',
          basePath: `/${id}`,
          items,
        },
      },
    },
  };
}

const RAIL = buildRegisteredAppsFromBundleMap({
  media: entry('media', 20, [
    { path: '', label: 'Library', labelKey: 'media.library', icon: 'Film' },
  ]),
  finance: entry('finance', 10, [
    { path: '', label: 'Dashboard', labelKey: 'finance.dashboard', icon: 'LayoutDashboard' },
    { path: '/rules', label: 'Rules', labelKey: 'finance.rules', icon: 'BookOpen' },
  ]),
});

describe('app rail projection', () => {
  // The ordering rule, which is the one a reader notices when it breaks: the
  // rail is sorted by navOrder, not by the order pillars happened to register.
  it('orders the rail by navOrder, not insertion order', () => {
    expect(RAIL.map((app) => app.id)).toEqual(['finance', 'media']);
  });

  it('drops an entry whose manifest carries no navConfig', () => {
    const withBackendOnly = buildRegisteredAppsFromBundleMap({
      media: entry('media', 20, []),
      registry: {
        navOrder: 5,
        manifest: { id: 'registry', name: 'registry', version: '1.0.0', surfaces: ['app'] },
      },
    });
    expect(withBackendOnly.map((app) => app.id)).toEqual(['media']);
  });

  it.each(RAIL.map((app) => [app.id, app] as const))(
    '%s app icon resolves through iconMap',
    (_, app) => {
      expect(iconMap[app.icon]).toBeDefined();
    }
  );

  it.each(
    RAIL.flatMap((app) =>
      app.items.map((item) => [`${app.id}${item.path || '/'}`, item.icon] as const)
    )
  )('%s item icon resolves through iconMap', (_, icon) => {
    expect(iconMap[icon]).toBeDefined();
  });

  it('has unique app ids', () => {
    const ids = RAIL.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique basePaths', () => {
    const basePaths = RAIL.map((app) => app.basePath);
    expect(new Set(basePaths).size).toBe(basePaths.length);
  });

  it.each(RAIL.map((app) => [app.id, app.basePath] as const))(
    '%s basePath is rooted (starts with "/")',
    (_, basePath) => {
      expect(basePath.startsWith('/')).toBe(true);
    }
  );

  it.each(RAIL.map((app) => [app.id, app] as const))(
    '%s items use rooted paths or the empty string',
    (_, app) => {
      for (const item of app.items) {
        expect(item.path === '' || item.path.startsWith('/')).toBe(true);
      }
    }
  );

  it.each(RAIL.map((app) => [app.id, app] as const))('%s items have unique paths', (_, app) => {
    const paths = app.items.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
