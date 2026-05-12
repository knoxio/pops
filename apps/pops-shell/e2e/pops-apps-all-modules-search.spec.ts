// Paired with pops-apps-finance-only-search.spec.ts: same query must produce
// media results here and none under POPS_APPS=finance.
import { expect, test } from '@playwright/test';

import { bootShellAndAwaitSearch, unrouteAll } from './helpers/shell-search';

const query = 'Matrix';

test.describe('Shell — search includes media results (all-modules build)', () => {
  test.beforeEach(async ({ page }) => {
    await bootShellAndAwaitSearch(page);
  });

  test.afterEach(async ({ page }) => {
    await unrouteAll(page);
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
