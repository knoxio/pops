/**
 * E2E tests for the Transactions page — tag display, TagEditor, and tag filtering.
 *
 * Coverage:
 * 1. Tags column renders chips / empty dash
 * 2. Clicking a tags cell opens the TagEditor popover
 * 3. Adding a tag via autocomplete suggestion pill
 * 4. Adding a custom tag via keyboard (Enter / comma)
 * 5. Removing a tag with the chip × button
 * 6. Cancel resets state and closes the popover
 * 7. Save calls transactions.update and closes the popover
 * 8. Suggest button fetches and merges AI suggestions
 * 9. Tags overflow: 4+ tags shows "+N" badge
 * 10. Tag filter in the DataTable filters rows
 * 11. Account and Type filters
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock transaction data
// ---------------------------------------------------------------------------

interface MockTransaction {
  id: string;
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
}

const TRANSACTIONS: MockTransaction[] = [
  {
    id: 'txn-001',
    description: 'WOOLWORTHS 1234',
    account: 'Amex',
    amount: -125.5,
    date: '2026-02-13',
    type: 'Expense',
    tags: ['Groceries'],
    entityId: 'woolworths-id',
    entityName: 'Woolworths',
    location: 'North Sydney',
  },
  {
    id: 'txn-002',
    description: 'NETFLIX.COM',
    account: 'Amex',
    amount: -19.99,
    date: '2026-02-12',
    type: 'Expense',
    tags: ['Entertainment', 'Subscriptions', 'Online', 'Tax Deductible'],
    entityId: 'netflix-id',
    entityName: 'Netflix',
    location: null,
  },
  {
    id: 'txn-003',
    description: 'SALARY DEPOSIT',
    account: 'ANZ Everyday',
    amount: 5000.0,
    date: '2026-02-10',
    type: 'Income',
    tags: [],
    entityId: null,
    entityName: null,
    location: null,
  },
  {
    id: 'txn-004',
    description: 'SHELL PETROL',
    account: 'Amex',
    amount: -85.0,
    date: '2026-02-11',
    type: 'Expense',
    tags: ['Transport'],
    entityId: 'shell-id',
    entityName: 'Shell',
    location: null,
  },
];

// ---------------------------------------------------------------------------
// API mock helpers
// ---------------------------------------------------------------------------

const trpcOk = (data: unknown) => ({ result: { data } });
const trpcBatchOk = (data: unknown) => [trpcOk(data)];

const mockListResponse = {
  data: TRANSACTIONS,
  pagination: { total: TRANSACTIONS.length, limit: 100, offset: 0, hasMore: false },
};

/**
 * Tags returned by the availableTags mock.
 * Must include "Dining" so tests that click the Dining suggestion pill can find it.
 * "Groceries" is also included so it's present in autocomplete (but filtered out when
 * the WOOLWORTHS row already has it as a current tag).
 */
const MOCK_AVAILABLE_TAGS = [
  'Dining',
  'Entertainment',
  'Groceries',
  'Health',
  'Shopping',
  'Subscriptions',
  'Transport',
];

const setupMockAPIs = async (page: Page) => {
  // tRPC's httpBatchLink batches concurrent queries into a single request:
  //   GET /trpc/transactions.list,transactions.availableTags?batch=1&input=...
  // A single Playwright route must handle any combination of these two procedures
  // and return a correctly-indexed multi-element batch response.
  await page.route(/\/trpc\/transactions\.(list|availableTags)/, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const hasList = path.includes('transactions.list');
    const hasAvailableTags = path.includes('transactions.availableTags');
    const isBatch = url.searchParams.has('batch');

    if (hasList && hasAvailableTags) {
      // Combined batch: procedures appear in URL order (list=0, availableTags=1)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { result: { data: mockListResponse } },
          { result: { data: MOCK_AVAILABLE_TAGS } },
        ]),
      });
    } else if (hasList) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isBatch ? trpcBatchOk(mockListResponse) : trpcOk(mockListResponse)),
      });
    } else {
      // availableTags only
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isBatch ? trpcBatchOk(MOCK_AVAILABLE_TAGS) : trpcOk(MOCK_AVAILABLE_TAGS)),
      });
    }
  });

  await page.route(/\/trpc\/transactions\.update/, async (route) => {
    const isBatch = new URL(route.request().url()).searchParams.has('batch');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? trpcBatchOk({ success: true }) : trpcOk({ success: true })),
    });
  });

  await page.route(/\/trpc\/transactions\.suggestTags/, async (route) => {
    const isBatch = new URL(route.request().url()).searchParams.has('batch');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        isBatch
          ? trpcBatchOk({ tags: ['Groceries', 'Online'] })
          : trpcOk({ tags: ['Groceries', 'Online'] }),
      ),
    });
  });
};

/**
 * Returns the open TagEditor popover content element.
 * Scopes all in-popover assertions to avoid leaking into the table.
 */
const getPopover = (page: Page) => page.locator('[data-slot="popover-content"]');

/**
 * Finds a filter <select> by its associated label text.
 * FilterBar renders an unlabelled <label> then a <select> inside the same .space-y-2 container.
 */
const getFilterSelect = (page: Page, labelText: string) =>
  page
    .locator(`label:has-text("${labelText}")`)
    .locator('xpath=..')
    .locator('select');

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

test.describe('Transactions Page — Tags display', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
    await page.goto('/transactions');
    await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible({ timeout: 10000 });
  });

  test('renders existing tags as badges', async ({ page }) => {
    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await expect(row.getByText('Groceries')).toBeVisible();
  });

  test('renders empty tags as a dash', async ({ page }) => {
    const row = page.getByRole('row', { name: /SALARY DEPOSIT/i });
    await expect(row.getByText('—')).toBeVisible();
  });

  test('caps display at 3 tags and shows overflow badge', async ({ page }) => {
    // Netflix has 4 tags — first 3 visible, 4th collapsed into "+1"
    const row = page.getByRole('row', { name: /NETFLIX/i });
    await expect(row.getByText('Entertainment')).toBeVisible();
    await expect(row.getByText('Subscriptions')).toBeVisible();
    await expect(row.getByText('Online')).toBeVisible();
    await expect(row.getByText('+1')).toBeVisible();
    // "Tax Deductible" should NOT appear as its own badge in the trigger
    await expect(row.getByText('Tax Deductible')).not.toBeVisible();
  });
});

test.describe('Transactions Page — TagEditor popover', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
    await page.goto('/transactions');
    await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible({ timeout: 10000 });
  });

  test('opens popover when tags cell is clicked', async ({ page }) => {
    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    await expect(popover.getByText('Edit tags')).toBeVisible();
    await expect(popover.getByPlaceholder(/type to add a tag/i)).toBeVisible();
  });

  test('shows current tags as removable chips inside popover', async ({ page }) => {
    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    await expect(popover.getByText('Groceries')).toBeVisible();
    // Remove button should exist (chip is removable)
    await expect(popover.getByRole('button', { name: 'Remove' })).toBeVisible();
  });

  test('adds a tag via autocomplete suggestion pill', async ({ page }) => {
    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    // "Dining" should be in the suggestion list (Groceries is filtered out since it's already a tag)
    await popover.getByRole('button', { name: /Dining/ }).click();

    // "Dining" chip should now appear in the popover
    await expect(popover.getByText('Dining')).toBeVisible();
  });

  test('adds a custom tag via Enter key', async ({ page }) => {
    const row = page.getByRole('row', { name: /SALARY DEPOSIT/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    const input = popover.getByPlaceholder(/type to add a tag/i);
    await input.fill('MyCustomTag');
    await input.press('Enter');

    await expect(popover.getByText('MyCustomTag')).toBeVisible();
    await expect(input).toHaveValue(''); // input clears after adding
  });

  test('adds a custom tag via comma key', async ({ page }) => {
    const row = page.getByRole('row', { name: /SALARY DEPOSIT/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    const input = popover.getByPlaceholder(/type to add a tag/i);
    await input.type('Income,');

    await expect(popover.getByText('Income')).toBeVisible();
    await expect(input).toHaveValue('');
  });

  test('removes a tag via the chip × button', async ({ page }) => {
    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    // Woolworths has one chip (Groceries) — click its Remove button
    await popover.getByRole('button', { name: 'Remove' }).first().click();

    // "Groceries" chip should be gone from the popover
    await expect(popover.getByRole('button', { name: 'Remove' })).not.toBeVisible();
  });

  test('Backspace removes last tag when input is empty', async ({ page }) => {
    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    const input = popover.getByPlaceholder(/type to add a tag/i);
    await input.focus();
    await input.press('Backspace');

    await expect(popover.getByRole('button', { name: 'Remove' })).not.toBeVisible();
  });

  test('Cancel resets tags and closes popover', async ({ page }) => {
    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    // Add a tag, then cancel
    await popover.getByRole('button', { name: /Dining/ }).click();
    await expect(popover.getByText('Dining')).toBeVisible();

    await popover.getByRole('button', { name: /cancel/i }).click();

    // Popover should close
    await expect(popover).not.toBeVisible();

    // Trigger button should still show only "Groceries" (Dining discarded)
    const rowAfter = page.getByRole('row', { name: /WOOLWORTHS/i });
    await expect(rowAfter.getByText('Groceries')).toBeVisible();
    await expect(rowAfter.getByText('Dining')).not.toBeVisible();
  });

  test('Escape closes popover without saving', async ({ page }) => {
    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    await popover.getByRole('button', { name: /Dining/ }).click();
    await page.keyboard.press('Escape');

    await expect(popover).not.toBeVisible();
    // Trigger still shows only "Groceries"
    await expect(page.getByRole('row', { name: /WOOLWORTHS/i }).getByText('Dining')).not.toBeVisible();
  });

  test('Save calls transactions.update and closes popover', async ({ page }) => {
    let capturedTags: string[] | undefined;

    await page.route(/\/trpc\/transactions\.update/, async (route) => {
      const raw = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      // tRPC batch body: {"0": {"json": {...}}} or {"0": {...}}
      const batchItem = raw['0'] as Record<string, unknown> | undefined;
      const parsed = (batchItem?.['json'] as Record<string, unknown>) ?? batchItem ?? raw;
      const data = parsed?.['data'] as Record<string, unknown> | undefined;
      capturedTags = data?.['tags'] as string[] | undefined;

      const isBatch = new URL(route.request().url()).searchParams.has('batch');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isBatch ? trpcBatchOk({ success: true }) : trpcOk({ success: true })),
      });
    });

    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    await popover.getByRole('button', { name: /Dining/ }).click();

    await popover.getByRole('button', { name: /^save$/i }).click();

    // Popover closes
    await expect(popover).not.toBeVisible();

    // API was called with updated tags
    await expect.poll(() => capturedTags, { timeout: 3000 }).toEqual(
      expect.arrayContaining(['Groceries', 'Dining']),
    );
  });

  test('Suggest button fetches and merges AI tag suggestions', async ({ page }) => {
    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    await popover.getByRole('button', { name: /^suggest$/i }).click();

    // Mock returns ["Groceries", "Online"]. "Groceries" is already present, so "Online" gets added.
    await expect(popover.getByText('Online')).toBeVisible({ timeout: 5000 });
  });

  test('Suggest button shows loading state while fetching', async ({ page }) => {
    await page.route(/\/trpc\/transactions\.suggestTags/, async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      const isBatch = new URL(route.request().url()).searchParams.has('batch');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          isBatch ? trpcBatchOk({ tags: ['Dining'] }) : trpcOk({ tags: ['Dining'] }),
        ),
      });
    });

    const row = page.getByRole('row', { name: /WOOLWORTHS/i });
    await row.getByRole('button', { name: /edit tags/i }).click();

    const popover = getPopover(page);
    await popover.getByRole('button', { name: /^suggest$/i }).click();

    await expect(popover.getByText('Suggesting…')).toBeVisible();
    await expect(popover.getByText('Dining')).toBeVisible({ timeout: 3000 });
    await expect(popover.getByRole('button', { name: /^suggest$/i })).toBeVisible();
  });
});

test.describe('Transactions Page — Tag filter', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
    await page.goto('/transactions');
    await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible({ timeout: 10000 });
  });

  test('filtering by tag shows only matching rows', async ({ page }) => {
    await page.getByPlaceholder(/filter by tag/i).fill('Groceries');

    await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible();
    await expect(page.getByText('NETFLIX.COM')).not.toBeVisible();
    await expect(page.getByText('SALARY DEPOSIT')).not.toBeVisible();
    await expect(page.getByText('SHELL PETROL')).not.toBeVisible();
  });

  test('filter is case-insensitive', async ({ page }) => {
    await page.getByPlaceholder(/filter by tag/i).fill('groceries');

    await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible();
    await expect(page.getByText('NETFLIX.COM')).not.toBeVisible();
  });

  test('partial tag match works', async ({ page }) => {
    await page.getByPlaceholder(/filter by tag/i).fill('entertain');

    await expect(page.getByText('NETFLIX.COM')).toBeVisible();
    await expect(page.getByText('WOOLWORTHS 1234')).not.toBeVisible();
  });

  test('clearing filter restores all rows', async ({ page }) => {
    const tagFilter = page.getByPlaceholder(/filter by tag/i);
    await tagFilter.fill('Groceries');
    await expect(page.getByText('NETFLIX.COM')).not.toBeVisible();

    await tagFilter.clear();

    await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible();
    await expect(page.getByText('NETFLIX.COM')).toBeVisible();
    await expect(page.getByText('SALARY DEPOSIT')).toBeVisible();
  });

  test('filter that matches no tags shows empty state', async ({ page }) => {
    await page.getByPlaceholder(/filter by tag/i).fill('zzznomatch');

    await expect(page.getByText('WOOLWORTHS 1234')).not.toBeVisible();
    await expect(page.getByText('NETFLIX.COM')).not.toBeVisible();
    await expect(page.getByText(/no results/i)).toBeVisible();
  });
});

test.describe('Transactions Page — Account and Type filters', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
    await page.goto('/transactions');
    await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible({ timeout: 10000 });
  });

  test('account filter shows only matching account rows', async ({ page }) => {
    const accountSelect = getFilterSelect(page, 'Account');
    await accountSelect.selectOption('ANZ Everyday');

    await expect(page.getByText('SALARY DEPOSIT')).toBeVisible();
    await expect(page.getByText('WOOLWORTHS 1234')).not.toBeVisible();
    await expect(page.getByText('NETFLIX.COM')).not.toBeVisible();
  });

  test('type filter shows only matching type rows', async ({ page }) => {
    const typeSelect = getFilterSelect(page, 'Type');
    await typeSelect.selectOption('Income');

    await expect(page.getByText('SALARY DEPOSIT')).toBeVisible();
    await expect(page.getByText('WOOLWORTHS 1234')).not.toBeVisible();
  });

  test('resetting account filter restores all rows', async ({ page }) => {
    const accountSelect = getFilterSelect(page, 'Account');
    await accountSelect.selectOption('ANZ Everyday');
    await expect(page.getByText('WOOLWORTHS 1234')).not.toBeVisible();

    // Select the "All Accounts" option by label (the "" value is also used by the
    // disabled placeholder rendered by the Select component, so target by label)
    await accountSelect.selectOption({ label: 'All Accounts' });

    await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible();
    await expect(page.getByText('SALARY DEPOSIT')).toBeVisible();
  });
});
