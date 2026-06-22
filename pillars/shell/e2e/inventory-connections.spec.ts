/**
 * E2E test — Inventory connections between items (#2127)
 *
 * Tier 3 flow: link two seeded inventory items via the Connect dialog, verify
 * the relationship is visible on both item detail pages, then delete the
 * connection from item A and verify it disappears from both sides.
 *
 * Design notes:
 *   - Uses seeded items inv-004 (Dyson V15 Vacuum) and inv-005 (Breville Barista
 *     Express). The seeder does NOT pre-connect these two items, so starting
 *     state is a clean "no connection between A and B". Neighbouring seeded
 *     connections (e.g. MacBook ↔ Headphones) are deliberately avoided.
 *   - Backend stores a single row with itemAId < itemBId ordering; both sides
 *     of the pair are derived from that one row via `listConnectionsForItem`,
 *     which ORs both columns. Bidirectionality is an artefact of the query,
 *     not a pair of rows — deleting once removes it from both perspectives.
 *   - The ConnectDialog is a Radix `Dialog` with a searchable picker. The
 *     tRPC `items.list` query only fires when the dialog is open AND the
 *     search string is ≥2 chars. We type a name substring, then click the
 *     result row (rendered as a `<button>` containing the item name).
 *   - Disconnect lives on each ConnectionRow as an icon-button with
 *     `aria-label="Disconnect"`, followed by an AlertDialog confirming with
 *     heading "Disconnect <item name>?".
 *   - Idempotency: before the connect step we open each item's detail page
 *     and clear any leftover connection between A ↔ B that may remain from a
 *     prior failed run. Plus a best-effort `afterAll` runs the same cleanup
 *     to keep the persisted e2e DB deterministic across reruns.
 *   - Serial describe mode: the three tests (connect, verify from B, delete)
 *     share a single state transition; they must run in order.
 *   - pageerror + console-error listeners are registered before navigation
 *     and asserted in afterEach so every test enforces the no-crash
 *     requirement from the issue.
 */
import { expect, test, type Page } from '@playwright/test';

import { useRealApi } from './helpers/use-real-api';

// Two seeded items that the seeder does NOT pre-link.
const ITEM_A_ID = 'inv-004';
const ITEM_A_NAME = 'Dyson V15 Vacuum';

const ITEM_B_ID = 'inv-005';
const ITEM_B_NAME = 'Breville Barista Express';
// Search term for the ConnectDialog — needs ≥2 chars to trigger the tRPC
// items.list query, and specific enough to rank Breville on the first page.
const ITEM_B_SEARCH = 'Breville Barista';

/** Navigate to a seeded item's detail page and wait for the heading. */
async function gotoItemDetail(page: Page, id: string, name: string): Promise<void> {
  await page.goto(`/inventory/items/${id}`);
  await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 10_000 });
}

/**
 * Scope to the "Connected Items" section (not the "Connection Chain" panel
 * below it, which also lists connected items as tree nodes).
 */
function connectedItemsSection(page: Page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^connected items$/i }) });
}

/** Row inside the Connected Items list that links to the given item's detail page. */
function connectedItemRow(page: Page, connectedItemId: string) {
  return connectedItemsSection(page).locator(`a[href="/inventory/items/${connectedItemId}"]`);
}

/**
 * Best-effort disconnect of A ↔ B from the A detail page. Does nothing if no
 * connection currently exists. Used for pre-run idempotency and afterAll
 * cleanup.
 */
async function removeConnectionIfPresent(page: Page): Promise<void> {
  await gotoItemDetail(page, ITEM_A_ID, ITEM_A_NAME);
  const row = connectedItemRow(page, ITEM_B_ID);
  if (!(await row.isVisible().catch(() => false))) return;

  await connectedItemsSection(page)
    .locator(`a[href="/inventory/items/${ITEM_B_ID}"]`)
    .locator('..')
    .getByRole('button', { name: /^disconnect$/i })
    .click();

  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await confirm
    .getByRole('button', { name: /^disconnect$/i })
    .filter({ visible: true })
    .click();

  await expect(connectedItemRow(page, ITEM_B_ID)).toHaveCount(0, { timeout: 10_000 });
}

test.describe('Inventory — connections between items', () => {
  test.describe.configure({ mode: 'serial' });

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

  // Safety net — if any step below bailed before the explicit disconnect step,
  // remove any leftover A↔B connection so repeat local runs stay deterministic.
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await useRealApi(page);
      await removeConnectionIfPresent(page);
    } catch {
      // Cleanup is best-effort — swallow failures so they don't mask real test failures.
    } finally {
      await page.close();
      await context.close();
    }
  });

  test('connects item A to item B and B shows in A connections', async ({ page }) => {
    // Pre-run idempotency: ensure no stale A↔B connection lingers from a
    // previous aborted run before we try to create a new one.
    await removeConnectionIfPresent(page);

    await gotoItemDetail(page, ITEM_A_ID, ITEM_A_NAME);

    // Starting state: B is NOT already connected to A.
    await expect(connectedItemRow(page, ITEM_B_ID)).toHaveCount(0);

    // Open the ConnectDialog (Radix Dialog with a search picker inside).
    await page.getByRole('button', { name: /^connect item$/i }).click();
    const dialog = page.getByRole('dialog', { name: /^connect item$/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // The items.list tRPC query only runs when search length ≥ 2.
    const searchInput = dialog.getByPlaceholder(/search items/i);
    await searchInput.fill(ITEM_B_SEARCH);

    // Result row is a <button> whose label contains the full item name.
    const result = dialog.getByRole('button', { name: new RegExp(ITEM_B_NAME, 'i') });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    // Success toast fires on connect mutation success. Sonner nests elements,
    // so scope to .first() to avoid strict-mode violations on duplicate nodes.
    await expect(page.getByText(/items connected/i).first()).toBeVisible({ timeout: 10_000 });

    // Dialog closes, and B appears in A's Connected Items section.
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    const row = connectedItemRow(page, ITEM_B_ID);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(ITEM_B_NAME);
  });

  test('opening item B shows item A in its connections (bidirectional)', async ({ page }) => {
    await gotoItemDetail(page, ITEM_B_ID, ITEM_B_NAME);

    // A must appear in B's Connected Items — the backend stores one row with
    // A<B ordering and derives both sides from `itemAId = id OR itemBId = id`,
    // so the bidirectional view is a direct consequence of that one row.
    const row = connectedItemRow(page, ITEM_A_ID);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(ITEM_A_NAME);
  });

  test('deleting from A removes the connection from both items', async ({ page }) => {
    await gotoItemDetail(page, ITEM_A_ID, ITEM_A_NAME);
    const row = connectedItemRow(page, ITEM_B_ID);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // The Disconnect icon-button sits next to the B row (sibling of the <Link>).
    const disconnectButton = connectedItemsSection(page)
      .locator(`a[href="/inventory/items/${ITEM_B_ID}"]`)
      .locator('..')
      .getByRole('button', { name: /^disconnect$/i });
    await disconnectButton.click();

    // Confirm the destructive action.
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(new RegExp(`disconnect ${ITEM_B_NAME}`, 'i'))).toBeVisible();
    await confirm
      .getByRole('button', { name: /^disconnect$/i })
      .filter({ visible: true })
      .click();

    // Success toast fires on disconnect mutation success.
    await expect(page.getByText(/items disconnected/i).first()).toBeVisible({ timeout: 10_000 });

    // Row is gone from A's list.
    await expect(connectedItemRow(page, ITEM_B_ID)).toHaveCount(0, { timeout: 10_000 });

    // Bidirectional removal: navigate to B, confirm A is no longer listed.
    await gotoItemDetail(page, ITEM_B_ID, ITEM_B_NAME);
    await expect(connectedItemRow(page, ITEM_A_ID)).toHaveCount(0, { timeout: 10_000 });
  });
});
