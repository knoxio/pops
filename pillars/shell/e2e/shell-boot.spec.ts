/**
 * Boot install-set resolution — the registry snapshot decides what mounts.
 *
 * `src/app/boot-snapshot.ts` blocks first render on
 * `GET /registry-api/registry/pillars` and resolves the rail and the router
 * from it, falling back to the last good cached snapshot when the registry
 * says nothing usable. Both halves of that contract are unit-tested; what only a
 * browser can show is that the resolved set is what actually reaches the DOM,
 * and that the fallback is a working shell rather than an app-less one.
 */
import { expect, test } from '@playwright/test';

import {
  failRegistry,
  IN_REPO_PILLARS,
  json,
  stubPillarHealth,
  stubRegistry,
} from './helpers/pillar-rest';

import type { Page } from '@playwright/test';

test.describe('Shell — boot install set', () => {
  let errors: string[] = [];

  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(errors).toHaveLength(0);
  });

  test('mounts exactly the pillars the registry lists', async ({ page }) => {
    await stubRegistry(page, ['finance', 'media']);
    await stubPillarHealth(page, ['finance', 'media']);

    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Media' })).toBeVisible();

    // The negative half is the point: a rail built from the static floor would
    // carry these too, so their absence is what proves the snapshot drove it.
    await expect(page.getByRole('button', { name: 'Inventory' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lists' })).toHaveCount(0);
  });

  /**
   * These three assert the no-answer paths — empty, unreachable, malformed —
   * and they deliberately name no pillar.
   *
   * They used to assert the in-repo floor by name, and had to be edited on
   * every swap in POPS-3215 as each pillar left the bundle map: an assertion
   * that rots on a schedule is one that gets weakened rather than fixed. What
   * is invariant across the whole epic, and after it, is the resilience
   * contract itself: whatever the registry does, the shell renders its own
   * chrome and reaches a usable state rather than a crash, a blank document,
   * or the loader's error placeholder.
   *
   * The floor's *contents* are asserted where they can be stated exactly —
   * `src/app/boot-snapshot.test.ts`, against the bundle map itself. What only
   * a browser can add is that the resolved result actually renders, which is
   * what these keep.
   */
  async function expectShellBooted(page: Page): Promise<void> {
    // The shell's own chrome, which no pillar supplies.
    await expect(page.getByRole('heading', { level: 1, name: 'POPS' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search POPS' })).toBeVisible();
    // Not the loader's failure surface, and not the router's 404.
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  }

  test('an empty snapshot still boots a usable shell', async ({ page }) => {
    await stubRegistry(page, []);
    await stubPillarHealth(page, IN_REPO_PILLARS);

    await page.goto('/');

    await expectShellBooted(page);
  });

  test('an unreachable registry still boots the shell', async ({ page }) => {
    await failRegistry(page);
    await stubPillarHealth(page, IN_REPO_PILLARS);

    await page.goto('/');

    await expectShellBooted(page);
  });

  test('a registry answering with garbage is treated as no answer', async ({ page }) => {
    await page.route(/\/registry-api\/registry\/pillars$/, (route) =>
      json(route, 200, { pillars: 'not-a-list' })
    );
    await stubPillarHealth(page, IN_REPO_PILLARS);

    await page.goto('/');

    await expectShellBooted(page);
  });
});
