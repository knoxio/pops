/**
 * Install-set switching E2E — search results narrow with the install set
 * (PRD-101 US-11 follow-up, issue #2595).
 *
 * Finance-only half of the matched pair. The companion all-modules
 * assertion lives in `pops-apps-all-modules-search.spec.ts`; together they
 * satisfy the deferred acceptance criterion from
 * `docs/themes/01-foundation/prds/101-plugin-contract/us-11-test-matrix.md`:
 *
 *   With every module installed, searching for a known media title
 *   returns a media result; with `POPS_APPS=finance` the same query
 *   returns zero media results.
 *
 * "The Matrix" is a seeded movie title (see `apps/pops-api/src/db/seeder.ts`).
 * Filing the search through `useRealApi()` exercises the real adapter
 * pipeline against the seeded e2e SQLite environment; the frontend's
 * `isInstalledModule` filter then drops the media section because this
 * shell build was launched with `POPS_APPS=finance,core` and the
 * registry snapshot it consumed therefore omits `media` from `MODULES`.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const QUERY = 'Matrix';

test.describe('Shell — search narrows to installed modules (finance-only build)', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
    await page.goto('/');
    // With media excluded, the shell still routes `/` → `/finance` via
    // `IndexRedirect`. Wait for the search input mount before typing.
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('textbox', { name: 'Search POPS' })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('searching "Matrix" returns no movies results when media is uninstalled', async ({
    page,
  }) => {
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });

    await searchBox.click();
    await searchBox.fill(QUERY);

    // The panel may render — wait for either the panel to appear (and
    // show "no results") or stay hidden if no sections at all. Either way,
    // the `movies` section must NOT be visible: that's the install-set
    // boundary assertion. `count()` on a non-rendered locator returns 0,
    // so this single check covers both render outcomes.
    const panel = page.getByTestId('search-results-panel');

    // Give the backend a moment to respond and the frontend's
    // `isInstalledModule` filter to apply. We're asserting an absence, so
    // we wait for the panel to settle rather than for a specific section
    // to appear. A short timeout is sufficient because the e2e SQLite
    // env is local and the search adapter is fast.
    await page.waitForTimeout(1500);

    await expect(panel.getByTestId('section-movies')).toHaveCount(0);
    await expect(panel.getByTestId('section-tv-shows')).toHaveCount(0);
  });
});
