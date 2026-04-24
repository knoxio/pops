/**
 * Smoke test — Inventory warranties list with expiry flagging (#2113)
 *
 * Tier 2 — confirm the warranty tracking page loads seeded items, renders
 * future-expiry items in the Active section with a "N days" remaining badge,
 * and visually flags past-expiry items in a dedicated "Expired" section
 * containing "Xd ago" muted text.
 *
 * Crash detection is wired into beforeEach/afterEach so every test in this
 * suite verifies the page does not crash (no separate crash test needed).
 *
 * Seeded warranty items (from apps/pops-api/src/db/seeder.ts):
 *   Active  (future expiry): MacBook Pro 16-inch → 2027-11-15,
 *                            Sony WH-1000XM5    → 2027-02-02,
 *                            USB-C Hub          → 2026-11-15,
 *                            Standing Desk      → 2029-10-01, …
 *   Expired (past expiry):   Samsung 65" QLED TV → 2025-08-20,
 *                            Breville Barista    → 2025-12-01,
 *                            Dyson V15 Vacuum    → 2026-03-10
 *
 * Notes:
 * - The "Expired" collapsible section is collapsed by default whenever any
 *   non-expired items exist, so the test clicks its header to reveal rows.
 * - Flagging is detected semantically via:
 *     • the "Expired" section header + count badge,
 *     • the "Xd ago" muted-text pattern on an expired row, and
 *     • the "N days" badge on an active row.
 *   Tailwind class names are intentionally NOT asserted.
 */
import { expect, test } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

test.describe('Inventory — warranties list with expiry flagging', () => {
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
    await page.goto('/inventory/warranties');
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

  test('renders the Warranty Tracking page header', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Warranty Tracking/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('renders a seeded future-expiry item inside the Active section', async ({ page }) => {
    // Active section expands by default. Its header renders as a toggle
    // <button> whose accessible name is "Active <count>" (e.g. "Active 6").
    // MacBook Pro has a 2027 expiry → >90d out, so it lives in Active.
    await expect(page.getByRole('button', { name: /^Active\s+\d+/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/MacBook Pro/i).first()).toBeVisible();
    // Future-expiry items render a "N days" remaining badge (no urgency flag).
    await expect(page.getByText(/^\d+ days$/).first()).toBeVisible();
  });

  test('flags past-expiry items under a dedicated Expired section', async ({ page }) => {
    // With both active + expired seed items present, the "Expired" section is
    // collapsed by default. The header toggle button stays visible.
    const expiredToggle = page.getByRole('button', { name: /^Expired/ });
    await expect(expiredToggle).toBeVisible({ timeout: 10_000 });

    // Expand the Expired section to reveal flagged rows.
    await expiredToggle.click();

    // A seeded past-expiry item appears (Samsung TV expired 2025-08-20).
    await expect(page.getByText(/Samsung 65/i).first()).toBeVisible();

    // The visual flag for past-expiry items is "Xd ago" muted-text, which the
    // Active section never renders — presence proves semantic flagging.
    await expect(page.getByText(/^\d+d ago$/).first()).toBeVisible();
  });
});
