import { describe, expect, it } from 'vitest';

import { manifest, navConfig, routes } from '../index.js';

describe('PRD-118 — app-food module manifest', () => {
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

  it('does NOT yet declare a backend slot (Epic 00 implementation fills it)', () => {
    expect(manifest.backend).toBeUndefined();
  });
});
