/**
 * Install-set switching E2E — search results narrow with the install set.
 *
 * A regression here means the `isInstalledModule` filter has broken or
 * the finance-only shell is consuming the wrong registry snapshot —
 * either way, the install-set boundary leaks media results to operators
 * who excluded the media module.
 */
import { expect, test } from '@playwright/test';

import { bootShellAndAwaitSearch, unrouteAll } from './helpers/shell-search';

const query = 'Matrix';

test.describe('Shell — search narrows to installed modules (finance-only build)', () => {
  test.beforeEach(async ({ page }) => {
    await bootShellAndAwaitSearch(page);
  });

  test.afterEach(async ({ page }) => {
    await unrouteAll(page);
  });

  test('searching "Matrix" returns no movies results when media is uninstalled', async ({
    page,
  }) => {
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });

    // The search query is wired through tRPC `core.search.query`; wait
    // for that response so the absence assertion runs against settled
    // state rather than a pre-render race.
    const searchResponse = page.waitForResponse(
      (response) => response.url().includes('core.search.query') && response.status() === 200,
      { timeout: 10_000 }
    );

    await searchBox.click();
    await searchBox.fill(query);

    await searchResponse;

    const panel = page.getByTestId('search-results-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByTestId('section-movies')).toHaveCount(0);
    await expect(panel.getByTestId('section-tv-shows')).toHaveCount(0);
  });
});
