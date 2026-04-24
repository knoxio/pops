/**
 * Smoke test — global search returns results (#2105)
 *
 * Tier 1 minimum: the top-bar search input opens, accepts a query matching a
 * seeded entity ("Woolworths"), renders a results panel with at least one
 * result, and the panel closes on Escape.
 *
 * Real API against the seeded 'e2e' SQLite environment. The desktop search
 * input is always mounted in the shell's <TopBar> and the viewport used by
 * the 'webkit' project (Desktop Safari) is wide enough for the `md:flex`
 * breakpoint, so no mobile-overlay fallback is needed.
 *
 * Crash detection is wired into beforeEach/afterEach so every test in this
 * suite verifies the page does not crash.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Global search — smoke test', () => {
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    await useRealApi(page);
    // Register before navigation so errors on first load are captured.
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/');
    // Root redirects to /finance — wait for navigation and shell mount.
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

  test('typing "Woolworths" returns at least one result and Escape closes the panel', async ({
    page,
  }) => {
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });

    // Trigger search — focus opens the panel; typing submits the query.
    await searchBox.click();
    await searchBox.fill('Woolworths');

    // Results panel appears (SearchResultsPanel uses data-testid="search-results-panel").
    const panel = page.getByTestId('search-results-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // At least one result references the seeded "Woolworths" entity. Scope to
    // the panel to avoid matching any unrelated "Woolworths" text on the page
    // beneath (e.g. the transactions list on /finance).
    await expect(panel.getByText(/Woolworths/i).first()).toBeVisible();

    // Escape dismisses the panel (usePanelDismiss + useSearchKeyboardNav).
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('Cmd+K focuses the global search input', async ({ page }) => {
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });

    // Click elsewhere first so the input doesn't already own focus.
    await page.getByRole('heading').first().click();
    await expect(searchBox).not.toBeFocused();

    // Shortcut registered on document — works from any page.
    await page.keyboard.press('Meta+k');
    await expect(searchBox).toBeFocused();
  });
});
