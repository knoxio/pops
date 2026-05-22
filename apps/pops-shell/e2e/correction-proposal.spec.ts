/**
 * E2E tests for the Correction Proposal dialog.
 *
 * Verifies that editing a rule field auto-reruns the preview so Apply stays
 * reachable without forcing the user to manually click ↺. All API calls are
 * mocked — no real backend or Claude API needed.
 */
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_ID = 'test-correction-session';
const ENTITY_ID = 'american-express-id';
const ENTITY_NAME = 'American Express';
const OP_CLIENT_ID = 'op-client-1';

const UNCERTAIN_TX = {
  date: '2026-02-10',
  description: 'MEMBERSHIP FEE',
  amount: -450.0,
  account: 'Amex',
  checksum: 'membership-fee-checksum-1',
};

const TEST_CSV = `Date,Description,Amount
${UNCERTAIN_TX.date},${UNCERTAIN_TX.description},${Math.abs(UNCERTAIN_TX.amount)}`;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type RouteResponse = Record<string, unknown> | unknown[];

const batchWrap = (url: URL, data: RouteResponse): RouteResponse =>
  url.searchParams.has('batch') ? [{ result: { data } }] : { result: { data } };

const fulfill = async (route: Parameters<Parameters<Page['route']>[1]>[0], data: RouteResponse) => {
  const url = new URL(route.request().url());
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(batchWrap(url, data)),
  });
};

/**
 * Wire up all mocks needed to reach the Review step with one uncertain group.
 * Returns a function that intercepts `previewChangeSet` calls so tests can
 * assert how many times it was invoked.
 */
async function setupMocks(page: Page): Promise<{ getPreviewCallCount: () => number }> {
  let previewCallCount = 0;

  // Process: one uncertain transaction
  await page.route(/\/trpc\/imports\.processImport/, async (route) =>
    fulfill(route, {
      sessionId: SESSION_ID,
      matched: [],
      uncertain: [
        {
          ...UNCERTAIN_TX,
          rawRow: '{}',
          status: 'uncertain',
          entity: null,
        },
      ],
      failed: [],
      skipped: [],
    })
  );

  // Progress: instantly complete
  await page.route(/\/trpc\/imports\.getImportProgress/, async (route) =>
    fulfill(route, {
      status: 'completed',
      processedCount: 1,
      totalTransactions: 1,
      matched: [],
      uncertain: [
        {
          ...UNCERTAIN_TX,
          rawRow: '{}',
          status: 'uncertain',
          entity: null,
        },
      ],
      failed: [],
      skipped: [],
      currentStep: 'completed',
    })
  );

  // Entities list: include American Express so it appears in the picker
  await page.route(/\/trpc\/core\.entities\.list|\/trpc\/finance\.entities\.list/, async (route) =>
    fulfill(route, {
      entities: [
        {
          id: ENTITY_ID,
          name: ENTITY_NAME,
          aliases: [],
          category: null,
        },
      ],
      total: 1,
    })
  );

  // Batched queries that include entities.list
  await page.route(/\/trpc\/.*entities\.list.*/, async (route) => {
    const url = route.request().url();
    if (url.includes('entities.list')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            result: {
              data: {
                entities: [{ id: ENTITY_ID, name: ENTITY_NAME, aliases: [], category: null }],
                total: 1,
              },
            },
          },
        ]),
      });
    } else {
      await route.continue();
    }
  });

  // Proposal: one "add rule" op targeting the entity
  await page.route(/corrections\.proposeChangeSet/, async (route) =>
    fulfill(route, {
      changeSet: {
        ops: [
          {
            op: 'add',
            id: OP_CLIENT_ID,
            data: {
              descriptionPattern: UNCERTAIN_TX.description,
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
      rationale: 'Add a rule for MEMBERSHIP FEE → American Express',
      targetRules: {},
    })
  );

  // Preview: returns a minimal result so the "No preview yet" disappears
  await page.route(/corrections\.previewChangeSet/, async (route) => {
    previewCallCount++;
    await fulfill(route, {
      diffs: [
        {
          description: UNCERTAIN_TX.description,
          checksum: UNCERTAIN_TX.checksum,
          before: { entityName: null, transactionType: null, location: null },
          after: { entityName: ENTITY_NAME, transactionType: null, location: null },
          matchedRule: null,
          status: 'matched',
        },
      ],
      summary: { newMatches: 1, removedMatches: 0, statusChanges: 0 },
    });
  });

  // Apply: succeed silently
  await page.route(/corrections\.applyChangeSet/, async (route) =>
    fulfill(route, { success: true })
  );

  // Core settings / nudges / other background calls — return empty defaults
  await page.route(/\/trpc\/core\.settings/, async (route) => fulfill(route, { data: null }));
  await page.route(/\/trpc\/cerebrum\.nudges/, async (route) => fulfill(route, { items: [] }));
  await page.route(/\/trpc\/cerebrum\./, async (route) => fulfill(route, {}));

  return { getPreviewCallCount: () => previewCallCount };
}

/** Upload a CSV string and advance past the Map step to reach Review. */
async function navigateToReview(page: Page, csvContent: string): Promise<void> {
  await page.goto('/finance/import');
  await expect(page.getByText('Upload CSV')).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'test.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvContent),
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
  test.beforeEach(async ({ page }) => {
    await page.goto('/finance/import');
  });

  test('dialog opens when an entity is chosen for an uncertain transaction', async ({ page }) => {
    await setupMocks(page);
    await navigateToReview(page, TEST_CSV);

    // The uncertain group should be visible
    await expect(page.getByText(/Uncertain/)).toBeVisible();

    // Open the entity picker on the first uncertain group
    const group = page.locator('[data-testid="transaction-group"]').first();
    await group.getByRole('button', { name: /choose existing/i }).click();

    // Select American Express
    const entitySelect = group.locator('select');
    await entitySelect.selectOption(ENTITY_ID);

    // Correction Proposal dialog should appear
    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('MEMBERSHIP FEE')).toBeVisible();
  });

  test('Apply ChangeSet is enabled on initial open', async ({ page }) => {
    await setupMocks(page);
    await navigateToReview(page, TEST_CSV);

    const group = page.locator('[data-testid="transaction-group"]').first();
    await group.getByRole('button', { name: /choose existing/i }).click();
    const entitySelect = group.locator('select');
    await entitySelect.selectOption(ENTITY_ID);

    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 5000 });

    // After initial preview runs, Apply should become enabled
    const applyBtn = page.getByRole('button', { name: /Apply ChangeSet/i });
    await expect(applyBtn).toBeEnabled({ timeout: 10000 });
  });

  test('changing Transaction type auto-reruns preview and re-enables Apply', async ({ page }) => {
    const { getPreviewCallCount } = await setupMocks(page);
    await navigateToReview(page, TEST_CSV);

    const group = page.locator('[data-testid="transaction-group"]').first();
    await group.getByRole('button', { name: /choose existing/i }).click();
    const entitySelect = group.locator('select');
    await entitySelect.selectOption(ENTITY_ID);

    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 5000 });

    const applyBtn = page.getByRole('button', { name: /Apply ChangeSet/i });
    await expect(applyBtn).toBeEnabled({ timeout: 10000 });

    const callsAfterOpen = getPreviewCallCount();

    // Change Transaction type to Expense — this is the bug scenario
    const txnTypeSelect = page
      .getByLabel(/Transaction type/i)
      .or(page.locator('select').filter({ hasText: /none|expense|transfer|income/i }));
    await txnTypeSelect.selectOption('purchase');

    // The fix: preview must auto-rerun WITHOUT the user clicking ↺
    await expect(async () => {
      expect(getPreviewCallCount()).toBeGreaterThan(callsAfterOpen);
    }).toPass({ timeout: 5000 });

    // After auto-rerun, Apply should be re-enabled (no "Preview stale" blocker)
    await expect(applyBtn).toBeEnabled({ timeout: 5000 });
    await expect(page.getByText(/Preview stale/i)).not.toBeVisible();
  });

  test('Apply ChangeSet closes the dialog', async ({ page }) => {
    await setupMocks(page);
    await navigateToReview(page, TEST_CSV);

    const group = page.locator('[data-testid="transaction-group"]').first();
    await group.getByRole('button', { name: /choose existing/i }).click();
    const entitySelect = group.locator('select');
    await entitySelect.selectOption(ENTITY_ID);

    await expect(page.getByText('Correction proposal')).toBeVisible({ timeout: 5000 });

    const applyBtn = page.getByRole('button', { name: /Apply ChangeSet/i });
    await expect(applyBtn).toBeEnabled({ timeout: 10000 });
    await applyBtn.click();

    await expect(page.getByText('Correction proposal')).not.toBeVisible({ timeout: 5000 });
  });
});
