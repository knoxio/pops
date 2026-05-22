/**
 * E2E tests for the Correction Proposal dialog.
 *
 * Verifies that editing a rule field auto-reruns the preview so Apply stays
 * reachable without forcing the user to manually click ↺. All API calls are
 * mocked — no real backend or Claude API needed.
 */
import { test, expect, type Page } from '@playwright/test';

import { createMockData } from './fixtures/import-test-data';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_ID = 'american-express-id';
const ENTITY_NAME = 'American Express';
const UNCERTAIN_DESCRIPTION = 'MEMBERSHIP FEE';

const TEST_CSV = `Date,Description,Amount
2026-02-10,${UNCERTAIN_DESCRIPTION},450.00`;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Sets up all mocks needed for the correction proposal flow.
 * Must be called BEFORE page.goto so routes are registered first.
 * Returns a getter for the number of previewChangeSet calls.
 */
async function setupMocks(page: Page): Promise<{ getPreviewCallCount: () => number }> {
  let previewCallCount = 0;

  const baseData = createMockData('simple');
  // Replace the uncertain transaction with our test one
  const mockData = {
    ...baseData,
    matched: [],
    uncertain: [
      {
        date: '2026-02-10',
        description: UNCERTAIN_DESCRIPTION,
        amount: -450.0,
        account: 'Amex',
        rawRow: '{}',
        checksum: 'membership-fee-checksum',
        entity: null,
        status: 'uncertain' as const,
      },
    ],
  };

  // processImport: return one uncertain transaction
  await page.route(/\/trpc\/imports\.processImport/, async (route) => {
    const url = new URL(route.request().url());
    const isBatch = url.searchParams.has('batch');
    const responseData = { result: { data: { sessionId: 'test-session', ...mockData } } };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? [responseData] : responseData),
    });
  });

  // getImportProgress: instantly complete for the process phase
  await page.route(/\/trpc\/imports\.getImportProgress/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: { data: { status: 'completed', result: mockData } },
      }),
    });
  });

  // entities.list: expose American Express so the picker has an option
  await page.route(/\/trpc\/.*entities\.list/, async (route) => {
    const url = new URL(route.request().url());
    const isBatch = url.searchParams.has('batch');
    const data = {
      entities: [{ id: ENTITY_ID, name: ENTITY_NAME, aliases: [], category: null }],
      total: 1,
    };
    const responseData = { result: { data } };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? [responseData] : responseData),
    });
  });

  // proposeChangeSet: return one "add rule" op
  await page.route(/corrections\.proposeChangeSet/, async (route) => {
    const url = new URL(route.request().url());
    const isBatch = url.searchParams.has('batch');
    const data = {
      changeSet: {
        ops: [
          {
            op: 'add',
            id: 'op-1',
            data: {
              descriptionPattern: UNCERTAIN_DESCRIPTION,
              matchType: 'exact',
              entityName: ENTITY_NAME,
              entityId: ENTITY_ID,
              transactionType: null,
              location: null,
              tags: [],
            },
          },
        ],
      },
      rationale: 'Rule for MEMBERSHIP FEE',
      targetRules: {},
    };
    const responseData = { result: { data } };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? [responseData] : responseData),
    });
  });

  // previewChangeSet: count calls, return a minimal preview result
  await page.route(/corrections\.previewChangeSet/, async (route) => {
    previewCallCount++;
    const url = new URL(route.request().url());
    const isBatch = url.searchParams.has('batch');
    const data = {
      diffs: [
        {
          description: UNCERTAIN_DESCRIPTION,
          checksum: 'membership-fee-checksum',
          before: { entityName: null, transactionType: null, location: null },
          after: { entityName: ENTITY_NAME, transactionType: null, location: null },
          matchedRule: null,
          status: 'matched',
        },
      ],
      summary: { newMatches: 1, removedMatches: 0, statusChanges: 0 },
    };
    const responseData = { result: { data } };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? [responseData] : responseData),
    });
  });

  // applyChangeSet: succeed
  await page.route(/corrections\.applyChangeSet/, async (route) => {
    const url = new URL(route.request().url());
    const isBatch = url.searchParams.has('batch');
    const responseData = { result: { data: { success: true } } };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? [responseData] : responseData),
    });
  });

  // Silence background calls that aren't relevant to these tests
  await page.route(/\/trpc\/corrections\.list/, async (route) => {
    const url = new URL(route.request().url());
    const isBatch = url.searchParams.has('batch');
    const responseData = { result: { data: { rules: [], total: 0 } } };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? [responseData] : responseData),
    });
  });

  return { getPreviewCallCount: () => previewCallCount };
}

/** Upload a CSV and click through Map to reach the Review heading. */
async function navigateToReview(page: Page): Promise<void> {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'test.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(TEST_CSV),
  });

  await page.getByRole('button', { name: /next/i }).click();
  await expect(page.getByText('Map Columns')).toBeVisible();
  await page.getByRole('button', { name: /next/i }).click();
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({ timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Correction Proposal Dialog', () => {
  test('dialog opens when an entity is chosen for an uncertain transaction', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/finance/import');
    await navigateToReview(page);

    const group = page.locator('[data-testid="transaction-group"]').first();
    await expect(group).toBeVisible({ timeout: 5000 });

    await group.getByRole('button', { name: /choose existing/i }).click();
    await group.locator('select').selectOption(ENTITY_ID);

    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(UNCERTAIN_DESCRIPTION)).toBeVisible();
  });

  test('Apply ChangeSet is enabled on initial open', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/finance/import');
    await navigateToReview(page);

    const group = page.locator('[data-testid="transaction-group"]').first();
    await group.getByRole('button', { name: /choose existing/i }).click();
    await group.locator('select').selectOption(ENTITY_ID);

    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 8000 });

    const applyBtn = page.getByRole('button', { name: /Apply ChangeSet/i });
    await expect(applyBtn).toBeEnabled({ timeout: 10000 });
  });

  test('changing Transaction type auto-reruns preview and re-enables Apply', async ({ page }) => {
    const { getPreviewCallCount } = await setupMocks(page);
    await page.goto('/finance/import');
    await navigateToReview(page);

    const group = page.locator('[data-testid="transaction-group"]').first();
    await group.getByRole('button', { name: /choose existing/i }).click();
    await group.locator('select').selectOption(ENTITY_ID);

    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 8000 });

    const applyBtn = page.getByRole('button', { name: /Apply ChangeSet/i });
    await expect(applyBtn).toBeEnabled({ timeout: 10000 });

    const callsAfterOpen = getPreviewCallCount();

    // Change Transaction type — this is the bug scenario the fix addresses
    const txnTypeSelect = page
      .locator('select')
      .filter({ has: page.locator('option[value="purchase"]') });
    await txnTypeSelect.selectOption('purchase');

    // Fix: preview must auto-rerun WITHOUT the user clicking ↺
    await expect(async () => {
      expect(getPreviewCallCount()).toBeGreaterThan(callsAfterOpen);
    }).toPass({ timeout: 5000 });

    await expect(applyBtn).toBeEnabled({ timeout: 5000 });
    await expect(page.getByText(/Preview stale/i)).not.toBeVisible();
  });

  test('Apply ChangeSet closes the dialog', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/finance/import');
    await navigateToReview(page);

    const group = page.locator('[data-testid="transaction-group"]').first();
    await group.getByRole('button', { name: /choose existing/i }).click();
    await group.locator('select').selectOption(ENTITY_ID);

    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 8000 });

    const applyBtn = page.getByRole('button', { name: /Apply ChangeSet/i });
    await expect(applyBtn).toBeEnabled({ timeout: 10000 });
    await applyBtn.click();

    await expect(page.getByText('Correction proposal')).not.toBeVisible({ timeout: 5000 });
  });
});
