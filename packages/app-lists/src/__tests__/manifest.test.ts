import { describe, expect, it } from 'vitest';

import { manifest, navConfig, routes } from '../index';

describe('PRD-139 — app-lists module manifest', () => {
  it('declares id="lists"', () => {
    expect(manifest.id).toBe('lists');
  });

  it('declares an app surface', () => {
    expect(manifest.surfaces).toContain('app');
  });

  it('exposes a frontend block with routes + navConfig', () => {
    expect(manifest.frontend).toBeDefined();
    expect(manifest.frontend?.routes).toBe(routes);
    expect(manifest.frontend?.navConfig).toBe(navConfig);
  });

  it('navConfig basePath is /lists', () => {
    expect(navConfig.basePath).toBe('/lists');
  });

  it('navConfig labelKey is "lists" (i18n namespace key)', () => {
    expect(navConfig.labelKey).toBe('lists');
  });

  it('exposes at least one route (the index landing page)', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0]).toMatchObject({ index: true });
  });

  it('exposes a /:id route for the detail page (PRD-140-C)', () => {
    const detail = routes.find((r) => 'path' in r && r.path === ':id');
    expect(detail).toBeDefined();
  });

  it('does NOT yet declare a backend slot (PRD-140 fills it)', () => {
    expect(manifest.backend).toBeUndefined();
  });
});
