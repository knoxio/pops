/**
 * E2E — Media watch history: log a watch event (#2117)
 *
 * Tier 2 flow: navigate to a seeded movie detail page (Interstellar), click
 * "Mark as Watched", visit /media/history, and confirm the movie appears as a
 * recent watch entry with a timestamp.
 *
 * Seed context (see apps/pops-api/src/db/seeder.ts):
 *   Seeded watch_history rows include Shawshank, Godfather, Dark Knight,
 *   Pulp Fiction, LOTR — so Interstellar is NOT pre-watched and is the
 *   natural candidate for "log a new watch event".
 *
 * Idempotency:
 *   watch_history rows are append-only from the UI's perspective (the
 *   MarkAsWatched button never upserts — it always inserts a new row).
 *   On re-runs the same test will add further rows; this is intentionally
 *   accepted here because:
 *     1. the assertion ("Interstellar appears in history with a timestamp")
 *        holds regardless of how many entries exist;
 *     2. the test still exercises the full log → list flow on every run;
 *     3. the e2e env is torn down in global-teardown, so cross-run buildup
 *        is bounded to a single session.
 *   We do NOT delete the created entry — deleting via the UI would add a
 *   second mutation surface that is out of scope for this Tier 2 smoke.
 *
 * Crash detection is wired into beforeEach/afterEach so every test in this
 * suite verifies no uncaught JS error occurs.
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

const MOVIE_TITLE = 'Interstellar';

/**
 * Open the Interstellar movie detail page from the library.
 *
 * We navigate to /media and click the card whose accessible name is
 * "Interstellar (Movie)". This avoids hard-coding the DB auto-increment id
 * while still producing a semantic locator.
 */
async function openInterstellarDetail(page: Page): Promise<void> {
  await page.goto('/media');
  const card = page.getByRole('link', { name: `${MOVIE_TITLE} (Movie)` });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.click();
  await expect(page).toHaveURL(/\/media\/movies\/\d+/);
  await expect(page.getByRole('heading', { name: MOVIE_TITLE })).toBeVisible();
}

test.describe('Media — watch history (log a watch event)', () => {
  test.describe.configure({ mode: 'serial' });

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
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('React Router') &&
        !e.includes('Download the React DevTools') &&
        // WebKit logs failed <img> loads (e.g. poster images) as console.error.
        // The e2e image cache is not populated during seeding, so 404s are expected.
        !e.includes('Failed to load resource')
    );
    expect(pageErrors).toHaveLength(0);
    expect(realConsoleErrors).toHaveLength(0);
  });

  test('logs a watch event from the movie detail page and shows it in history', async ({
    page,
  }) => {
    await openInterstellarDetail(page);

    // Capture the current watch count from the button label so we can assert
    // the count increments. Supports both first-ever watch ("Mark as Watched")
    // and subsequent runs where the button reads "Watched (N)".
    const markButton = page.getByRole('button', { name: 'Mark as watched' });
    await expect(markButton).toBeVisible({ timeout: 10_000 });
    const initialLabel = (await markButton.textContent())?.trim() ?? '';
    const initialCountMatch = /Watched\s*\((\d+)\)/.exec(initialLabel);
    const initialCount = initialCountMatch ? Number(initialCountMatch[1]) : 0;

    await markButton.click();

    // After a successful log, the button re-renders with an incremented count.
    await expect(markButton).toHaveText(new RegExp(`Watched\\s*\\(${initialCount + 1}\\)`), {
      timeout: 10_000,
    });

    // The success toast surfaces user-visible confirmation of the mutation.
    await expect(page.getByText('Marked as watched')).toBeVisible({ timeout: 10_000 });

    // Navigate to the history page and confirm Interstellar appears.
    await page.goto('/media/history');
    await expect(page.getByRole('heading', { name: 'Watch History' })).toBeVisible();

    // Interstellar should now appear in the list. Both HistoryCard (md+ grid)
    // and HistoryItem (mobile list) are always present in the DOM — only their
    // visibility is toggled via Tailwind `hidden`/`md:hidden`. Asserting on
    // `.first()` alone would match the mobile entry, which is display:none at
    // the Playwright desktop viewport, so we filter to the visible heading.
    const titleHeading = page
      .getByRole('heading', { level: 3, name: MOVIE_TITLE })
      .filter({ visible: true })
      .first();
    await expect(titleHeading).toBeVisible({ timeout: 10_000 });

    // The entry must render a timestamp. HistoryCard (desktop) shows a short
    // "D MMM" badge; HistoryItem (mobile) shows a long "D MMM YYYY, HH:MM"
    // string. Both layouts always exist in the DOM at CI's 1280×720 WebKit
    // viewport — we must scope to the visible card to avoid resolving to a
    // hidden sibling and failing `toBeVisible()`.
    const monthShort = new Date().toLocaleDateString('en-AU', { month: 'short' });
    const dayNumeric = new Date().toLocaleDateString('en-AU', { day: 'numeric' });
    const timestampPattern = new RegExp(`${dayNumeric}\\s+${monthShort}`);
    const interstellarCard = page
      .locator('div.group')
      .filter({ has: page.getByRole('heading', { level: 3, name: MOVIE_TITLE }) })
      .filter({ visible: true })
      .first();
    await expect(interstellarCard.getByText(timestampPattern).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
