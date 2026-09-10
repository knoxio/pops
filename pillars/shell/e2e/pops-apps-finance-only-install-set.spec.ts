/**
 * `POPS_APPS=finance,core` — what a restricted install set still gates.
 *
 * These run only against the `chromium-finance-only` project, whose shell is
 * built against a registry snapshot generated with that install set (see
 * `playwright.config.ts`). Two places still read the build-time set rather
 * than the live registry, and each is a different kind of leak if it breaks:
 *
 *   - `offlineInstallableSnapshot` narrows the CACHED snapshot through
 *     `isInstalledModule`, so an operator who excluded a module does not get
 *     it back the moment the registry goes quiet. Since POPS-3227 that cache
 *     is the whole of the offline floor — the in-repo bundle map it used to
 *     stand beside is gone — which makes it the only path the install set can
 *     still leak through, and the one the second test drives;
 *   - `isInstalledModule` in `libs/navigation` drops federated-search
 *     sections for modules this build did not ship, so results cannot link
 *     into a page that was never mounted.
 *
 * The registry is deliberately taken off the air. The boundary these assert is
 * the one the LIVE registry cannot restore: while it is answering it IS the
 * source of truth and `POPS_APPS` does not override it, so a snapshot
 * answering normally puts media on the rail on purpose.
 */
import { expect, test } from '@playwright/test';

import {
  CROSS_MODULE_SEARCH_SECTIONS,
  failRegistry,
  SEARCH_QUERY,
  stubOrchestratorSearch,
  stubPillarHealth,
  stubRegistry,
} from './helpers/pillar-rest';

test.describe('Shell — POPS_APPS=finance,core install set', () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('an excluded module is not-installed, not a 404', async ({ page }) => {
    await failRegistry(page);
    await stubPillarHealth(page, ['finance']);

    await page.goto('/media');

    // Both halves, because the two pages are the thing being told apart: a
    // 404 here would mean the router lost the module rather than gated it.
    await expect(page.getByRole('heading', { name: /module not installed/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /not found|404/i })).toHaveCount(0);
  });

  test('an excluded module stays off the rail when the shell falls back to its cache', async ({
    page,
  }) => {
    await stubPillarHealth(page, ['finance', 'media']);
    await stubRegistry(page, ['finance', 'media']);
    await page.goto('/finance');

    // The live registry is the source of truth while it answers, so media is
    // on the rail here ON PURPOSE. That is what makes the assertion after the
    // outage load-bearing rather than a pillar that was never there: the good
    // boot is what writes media into the cache.
    await expect(page.getByRole('button', { name: 'Media' })).toBeVisible();

    await failRegistry(page);
    await page.goto('/finance');

    // Finance proves the shell really did boot off the cache — an empty
    // surface would hide media too, and assert nothing about the narrowing.
    await expect(page.getByRole('button', { name: 'Finance' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Media' })).toHaveCount(0);
  });

  test('search drops results owned by an excluded module', async ({ page }) => {
    await failRegistry(page);
    await stubPillarHealth(page, ['finance']);
    // The same payload `global-search.spec.ts` asserts arrives whole against
    // the all-modules shell. Shared so that the two runs cannot drift apart:
    // this test's claim is the difference between them.
    await stubOrchestratorSearch(page, CROSS_MODULE_SEARCH_SECTIONS);

    await page.goto('/finance');
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });
    await expect(searchBox).toBeVisible();
    await searchBox.fill(SEARCH_QUERY);

    const panel = page.getByTestId('search-results-panel');
    // The finance section arriving is what makes the media section's absence
    // meaningful — without it, an empty panel would pass this test too.
    await expect(panel.getByTestId('section-transactions')).toBeVisible();
    await expect(panel.getByTestId('section-movies')).toHaveCount(0);
    await expect(panel.getByText('The Matrix')).toHaveCount(0);
  });
});
