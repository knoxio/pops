/**
 * Integration test — global search cross-domain results (#2137)
 *
 * Tier 3: typing a term that exists in more than one seeded domain must
 * produce a results panel grouped by domain, and clicking a single result
 * must navigate to the matching detail route.
 *
 * The seeded e2e dataset has no single term that overlaps a movie title and
 * a finance record, so the test uses "Netflix" — which matches the seeded
 * `entities` row ("Netflix") AND the seeded `transactions` row
 * ("Netflix Subscription"). These are two distinct search domains (served
 * by separate adapters with separate `data-testid="section-<domain>"`
 * groupings), which satisfies the issue's "≥ 2 different domains"
 * requirement.
 *
 * Navigation assertion: clicking the entity hit navigates to
 * `/finance/entities/<id>` — the URL change confirms the SearchInput's
 * click handler resolves the `pops:finance/entity/<id>` URI and routes via
 * `useSearchResultNavigation`.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Global search — cross-domain results', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    await useRealApi(page);
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/');
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.getByRole('textbox', { name: 'Search POPS' })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('"Netflix" surfaces entities + transactions sections and clicking a result navigates', async ({
    page,
  }) => {
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });

    await searchBox.click();
    await searchBox.fill('Netflix');

    const panel = page.getByTestId('search-results-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // Cross-domain assertion — at least two distinct domain sections must
    // render inside the panel. Each search adapter emits a grouped section
    // with `data-testid="section-<domain>"`; the `entities` and
    // `transactions` adapters are wired to separate Finance tables, so
    // seeing both confirms results came from different domains.
    const entitiesSection = panel.getByTestId('section-entities');
    const transactionsSection = panel.getByTestId('section-transactions');
    await expect(entitiesSection).toBeVisible();
    await expect(transactionsSection).toBeVisible();

    // Sanity-check that each section actually contains hit content tied to
    // the query — avoids a false positive where headers render with empty
    // lists (the panel hides empty sections, but assert the matching text
    // is present to be thorough).
    await expect(entitiesSection.getByText(/Netflix/i).first()).toBeVisible();
    await expect(transactionsSection.getByText(/Netflix/i).first()).toBeVisible();

    // Click the first entity hit — its URI is `pops:finance/entity/<id>`
    // and the navigation hook resolves that to `/finance/entities/<id>`.
    // Scope the click to the `<button>` inside the entities section so
    // we hit the SectionView result button, not the section header.
    const entityResultButton = entitiesSection.locator('button[data-uri]').first();
    await expect(entityResultButton).toBeVisible();
    const entityUri = await entityResultButton.getAttribute('data-uri');
    expect(entityUri).toMatch(/^pops:finance\/entity\/[^/]+$/);

    await entityResultButton.click();

    await expect(page).toHaveURL(/\/finance\/entities\/[^/]+$/);
    // The panel closes after a successful click (handleResultClick calls clear()).
    await expect(panel).toBeHidden();
  });
});
