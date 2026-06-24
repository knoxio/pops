import { describe, expect, it } from 'vitest';

import { manifest, navConfig, routes } from '../index.js';

describe('food app module manifest (pillars/food/docs/prds/app-shell)', () => {
  it('declares id="food"', () => {
    expect(manifest.id).toBe('food');
  });

  it('declares an app surface', () => {
    expect(manifest.surfaces).toContain('app');
  });

  it('exposes a frontend block with routes + navConfig', () => {
    expect(manifest.frontend).toBeDefined();
    expect(manifest.frontend?.routes).toBe(routes);
    expect(manifest.frontend?.navConfig).toBe(navConfig);
  });

  it('navConfig basePath is /food', () => {
    expect(navConfig.basePath).toBe('/food');
  });

  it('exposes at least one route (the index landing page)', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0]).toMatchObject({ index: true });
  });

  it('declares no backend slot', () => {
    expect(manifest.backend).toBeUndefined();
  });
});
