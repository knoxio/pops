/**
 * Tier 3 — keyboard navigation of the global search (#2138)
 *
 * Complements the Tier 1 smoke tests in `global-search.spec.ts` (which already
 * cover Cmd+K focusing the input and Escape-dismiss after a query is typed).
 * This suite focuses on keyboard-only navigation of the results list:
 *
 *   1. Open search via Cmd+K, type a multi-result query, ArrowDown to move
 *      through results, assert the focused result is highlighted, press Enter
 *      and confirm navigation to the URI-resolved detail page.
 *   2. With an empty search input and a seeded recent-searches history, the
 *      dropdown shows those entries; pressing Escape closes it without
 *      selecting anything.
 *
 * Real API against the seeded 'e2e' SQLite environment. "Netflix" is used as
 * the multi-result query because the seeder inserts both a "Netflix" entity
 * and a "Netflix Subscription" transaction, guaranteeing ≥2 hits.
 *
 * Product note — the focused result is indicated only by the Tailwind
 * `bg-accent` class on the result `<button>`; there is no `aria-selected`,
 * `aria-activedescendant`, or `role="option"` relationship. The only other
 * semantic-ish hook is the existing `data-result-index` attribute (already
 * used by the keyboard-nav hook for scroll-into-view), so we scope the
 * assertion with that attribute. Adding ARIA listbox semantics would let
 * this assertion be fully semantic.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const QUERY = 'Netflix';
const FINANCE_DETAIL_ROUTE = /\/finance\/(transactions|entities)\/[^/]+$/;
const RECENT_SEARCHES_STORAGE_KEY = 'pops:recent-searches';

/**
 * Locate the currently-selected result by its `data-result-index` and the
 * appended ` bg-accent` class. Matches the exact class composition applied
 * in `SectionView.tsx` so `hover:bg-accent` / `focus-visible:bg-accent`
 * variants don't false-match.
 */
function selectedResultAt(page: Page, index: number): Locator {
  return page.locator(`button[data-result-index="${index}"].bg-accent`);
}

test.describe('Global search — keyboard navigation (#2138)', () => {
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
    const filteredConsole = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(filteredConsole).toHaveLength(0);
  });

  test('Cmd+K opens search, ArrowDown highlights a result, Enter navigates', async ({ page }) => {
    // Focus search via the keyboard shortcut (document-level listener accepts
    // metaKey || ctrlKey; Meta+k fires metaKey on the Desktop Safari project).
    await page.keyboard.press('Meta+k');
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });
    await expect(searchBox).toBeFocused();

    // Type a query known to yield multiple seeded hits (Netflix entity +
    // "Netflix Subscription" transaction).
    await searchBox.fill(QUERY);

    // Results panel renders once debounced results arrive.
    const panel = page.getByTestId('search-results-panel').filter({ visible: true });
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // Sanity — ≥2 result buttons render before we start navigating.
    const resultButtons = panel.locator('button[data-result-index]');
    await expect(resultButtons.nth(1)).toBeVisible();

    // Initial selection is -1 (nothing highlighted).
    await expect(selectedResultAt(page, 0)).toHaveCount(0);

    // ArrowDown moves the selection to index 0.
    await page.keyboard.press('ArrowDown');
    await expect(selectedResultAt(page, 0)).toBeVisible();

    // ArrowDown again advances to index 1 and clears index 0's selection.
    await page.keyboard.press('ArrowDown');
    await expect(selectedResultAt(page, 1)).toBeVisible();
    await expect(selectedResultAt(page, 0)).toHaveCount(0);

    // Capture the URI of the highlighted result so we can match the
    // post-Enter route against it (resolved via uri-resolver).
    const selectedUri = await selectedResultAt(page, 1).getAttribute('data-uri');
    expect(selectedUri).toMatch(/^pops:finance\//);

    // Enter navigates to the highlighted result's detail page and closes
    // the panel (handleResultClick → clear() → showPanel becomes false).
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(FINANCE_DETAIL_ROUTE);
    await expect(panel).toBeHidden();

    // The URL must contain the id segment of the URI we selected.
    const selectedId = selectedUri?.split('/').pop();
    expect(selectedId).toBeTruthy();
    if (selectedId) expect(page.url()).toContain(selectedId);
  });

  test('Escape from an empty search closes the recent-searches panel', async ({ page }) => {
    // Seed a recent search so the dropdown renders on focus even with no
    // query typed — that matches the "empty search" state described in the
    // Tier 3 spec. Seeding via localStorage is safe because pops-shell uses
    // origin-scoped storage and each Playwright test runs in its own context.
    await page.evaluate(
      ([key, value]) => {
        window.localStorage.setItem(key, value);
      },
      [RECENT_SEARCHES_STORAGE_KEY, JSON.stringify([QUERY])]
    );
    await page.reload();
    await expect(page).toHaveURL(/\/finance/);

    // Focus the (still empty) input — no query, but recent searches populate
    // the dropdown via RecentSearches.
    const searchBox = page.getByRole('textbox', { name: 'Search POPS' });
    await searchBox.click();

    const recentPanel = page.getByTestId('recent-searches');
    await expect(recentPanel).toBeVisible();
    await expect(recentPanel.getByTestId(`recent-query-${QUERY}`)).toBeVisible();

    // Escape with empty input dismisses the dropdown (usePanelDismiss +
    // useSearchKeyboardNav both listen, either path closes the store).
    await page.keyboard.press('Escape');
    await expect(recentPanel).toBeHidden();
  });
});
