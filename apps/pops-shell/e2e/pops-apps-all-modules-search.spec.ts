/**
 * Install-set switching E2E — search returns media results when media
 * is installed (PRD-101 US-11 follow-up, issue #2595).
 *
 * All-modules half of the matched pair. The companion finance-only
 * assertion lives in `pops-apps-finance-only-search.spec.ts`; together
 * they satisfy the deferred acceptance criterion from
 * `docs/themes/01-foundation/prds/101-plugin-contract/us-11-test-matrix.md`:
 *
 *   With every module installed, searching for a known media title
 *   returns a media result; with `POPS_APPS=finance` the same query
 *   returns zero media results.
 *
 * "The Matrix" is a seeded movie title (see `apps/pops-api/src/db/seeder.ts`),
 * so the same query the finance-only spec issues must produce a movies
 * section here. Same query, two builds, two outcomes — that's the
 * contract.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const query = 'Matrix';

test.describe('Shell — search includes media results (all-modules build)', () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('textbox', { name: 'Search POPS' })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('searching "Matrix" surfaces a movies result against the seeded library', async ({
    page,
  }) => {
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });

    await searchBox.click();
    await searchBox.fill(query);

    const panel = page.getByTestId('search-results-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });

    const moviesSection = panel.getByTestId('section-movies');
    await expect(moviesSection).toBeVisible();
    // Seeded movie title — exact match would be "The Matrix"; the
    // adapter is contains-scored so a substring match is enough. Scope
    // to the section to avoid catching any unrelated text.
    await expect(moviesSection.getByText(/Matrix/i).first()).toBeVisible();
  });
});
