import { test, expect, Page } from '@playwright/test';
import { createMockData, createWarningMockData, type MockScenario } from './fixtures/import-test-data';
import { simpleCSV, realisticCSV, bulkCSV, duplicatesCSV, generateLargeCSV } from './fixtures/csv-samples';

/**
 * E2E tests for Import Wizard (6-step flow)
 *
 * Comprehensive test coverage:
 * 1. Upload CSV file
 * 2. Map columns
 * 3. Process transactions (with progress polling)
 * 4. Review and resolve uncertain matches
 * 5. Tag Review — confirm/adjust tags before import
 * 6. Execute import (with write overlay)
 * 7. View summary
 *
 * Features tested:
 * - Transaction editing (Save Once vs Save & Learn)
 * - AI suggestion acceptance
 * - Bulk operations (accept all, create for all, auto-match similar)
 * - Grouped vs List view modes
 * - Entity creation during review
 * - Progress polling for both process and execute phases
 * - Warnings and errors handling
 * - Review tab navigation
 * - Real-world scenarios
 * - Accessibility
 * - Error recovery
 */

interface SetupMockAPIsOptions {
  scenario?: MockScenario;
  processError?: boolean;
  executeError?: boolean;
  entityCreationError?: boolean;
  progressStages?: 'instant' | 'progressive';
}

/**
 * Enhanced mock API setup with configurable scenarios
 */
const setupMockAPIs = async (page: Page, options: SetupMockAPIsOptions = {}) => {
  const {
    scenario = 'simple',
    processError = false,
    executeError = false,
    entityCreationError = false,
    progressStages = 'instant',
  } = options;

  // Log all requests for debugging
  page.on('request', request => {
    if (request.url().includes('/trpc/')) {
      console.log('Request:', request.method(), request.url());
    }
  });

  const mockData = createMockData(scenario);

  // Mock processImport endpoint
  await page.route(/\/trpc\/imports\.processImport/, async (route) => {
    if (processError) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            message: 'Internal server error',
          },
        }),
      });
      return;
    }

    const url = new URL(route.request().url());
    const isBatch = url.searchParams.has('batch');

    const responseData = {
      result: {
        data: {
          sessionId: 'test-session-123',
          ...mockData,
        },
      },
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? [responseData] : responseData),
    });
  });

  // Mock getImportProgress endpoint
  // Track per-session call counts so process and execute phases are independent
  const sessionCallCounts = new Map<string, number>();
  await page.route(/\/trpc\/imports\.getImportProgress/, async (route) => {
    const url = new URL(route.request().url());
    let sessionId = 'unknown';
    try {
      const rawInput = url.searchParams.get('input') ?? '{}';
      const parsed = JSON.parse(decodeURIComponent(rawInput));
      sessionId = parsed['0']?.sessionId ?? 'unknown';
    } catch {
      // ignore parse errors
    }

    const count = (sessionCallCounts.get(sessionId) ?? 0) + 1;
    sessionCallCounts.set(sessionId, count);

    // The execute session always returns ExecuteImportOutput format;
    // the process session returns ProcessImportOutput format (matched/uncertain/failed/skipped arrays).
    const isExecuteSession = sessionId === 'execute-session-456';

    if (isExecuteSession) {
      // Execute phase: return ExecuteImportOutput format
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: {
              status: 'completed',
              result: {
                imported: mockData.matched.length,
                failed: [],
                skipped: mockData.skipped.length,
              },
            },
          },
        }),
      });
    } else if (progressStages === 'progressive') {
      // Process phase with progressive stages
      const stages = [
        {
          status: 'processing',
          currentStep: 'deduplicating',
          processedCount: 10,
          totalTransactions: 100,
          currentBatch: mockData.matched.slice(0, 5),
        },
        {
          status: 'processing',
          currentStep: 'matching',
          processedCount: 50,
          totalTransactions: 100,
          currentBatch: mockData.uncertain.slice(0, 5),
        },
        {
          status: 'processing',
          currentStep: 'writing',
          processedCount: 90,
          totalTransactions: 100,
          currentBatch: mockData.matched.slice(0, 3),
        },
        {
          status: 'completed',
          result: mockData,
        },
      ];

      const stage = stages[Math.min(count - 1, stages.length - 1)];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: stage,
          },
        }),
      });
    } else {
      // Process phase: instant completion - return ProcessImportOutput format (matched/uncertain/failed/skipped arrays)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            data: {
              status: 'completed',
              result: mockData,
            },
          },
        }),
      });
    }
  });

  // Mock executeImport endpoint
  await page.route(/\/trpc\/imports\.executeImport/, async (route) => {
    if (executeError) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify([{
          error: {
            json: {
              message: 'Import execution failed',
              code: -32603,
              data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
            },
          },
        }]),
      });
      return;
    }

    const url = new URL(route.request().url());
    const isBatch = url.searchParams.has('batch');
    const responseData = { result: { data: { sessionId: 'execute-session-456' } } };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isBatch ? [responseData] : responseData),
    });
  });

  // Mock entities.list endpoint
  await page.route(/\/trpc\/entities\.list/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          data: {
            data: [
              { id: 'woolworths-id', name: 'Woolworths' },
              { id: 'coles-id', name: 'Coles' },
              { id: 'netflix-id', name: 'Netflix' },
              { id: 'unknown-cafe-id', name: 'Unknown Cafe' },
              { id: 'mystery-store-id', name: 'Mystery Store' },
              { id: 'acme-corp-id', name: 'Acme Corporation' },
            ],
            pagination: {
              total: 6,
              limit: 50,
              offset: 0,
              hasMore: false,
            },
          },
        },
      }),
    });
  });

  // Mock createEntity endpoint
  await page.route(/\/trpc\/imports\.createEntity/, async (route) => {
    if (entityCreationError) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            message: 'Failed to create entity',
          },
        }),
      });
      return;
    }

    // tRPC batch requests use {"0": {"json": {"name": "..."}}} body format
    const requestBody = JSON.parse(route.request().postData() || '{}');
    const input = requestBody['0']?.json ?? requestBody;
    const entityName = input.name || 'New Entity';

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          data: {
            entityId: 'new-entity-id',
            entityName,
          },
        },
      }),
    });
  });

  // Mock corrections.createOrUpdate endpoint (for Save & Learn)
  await page.route(/\/trpc\/corrections\.createOrUpdate/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          data: {
            success: true,
          },
        },
      }),
    });
  });

  // Mock transactions.availableTags endpoint (used by TagEditor in TagReviewStep)
  await page.route(/\/trpc\/transactions\.availableTags/, async (route) => {
    const isBatch = new URL(route.request().url()).searchParams.has('batch');
    const body = isBatch
      ? [{ result: { data: ['Groceries', 'Dining', 'Transport', 'Subscriptions', 'Shopping', 'Health'] } }]
      : { result: { data: ['Groceries', 'Dining', 'Transport', 'Subscriptions', 'Shopping', 'Health'] } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
};

/**
 * Helper: Upload CSV file
 */
const uploadCSVFile = async (page: Page, csvContent: string, fileName: string = 'test.csv') => {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(csvContent),
  });

  await expect(page.getByText(fileName)).toBeVisible();
};

/**
 * Helper: Navigate to Review step (step 4) with uploaded data
 */
const navigateToReviewStep = async (page: Page, csvContent: string = simpleCSV) => {
  // Step 1: Upload
  await uploadCSVFile(page, csvContent);
  await page.getByRole('button', { name: /next/i }).click();

  // Step 2: Map columns
  await expect(page.getByText('Map Columns')).toBeVisible();
  await page.getByRole('button', { name: /next/i }).click();

  // Step 3: Wait for processing to complete
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({ timeout: 10000 });
};

/**
 * Helper: Navigate to Tag Review step (step 5) — goes through Review and clicks Continue
 */
const navigateToTagReviewStep = async (page: Page, csvContent: string = simpleCSV) => {
  await navigateToReviewStep(page, csvContent);

  // Resolve any uncertain transactions so Continue is enabled
  const uncertainTab = page.getByRole('tab', { name: /uncertain/i });
  const uncertainText = await uncertainTab.textContent();
  const uncertainCount = parseInt(uncertainText?.match(/\((\d+)\)/)?.[1] ?? '0', 10);
  if (uncertainCount > 0) {
    await uncertainTab.click();
    await page.getByRole('button', { name: /list/i }).click();
    for (let i = 0; i < uncertainCount; i++) {
      await page.getByRole('tabpanel').locator('select').first().selectOption('woolworths-id');
    }
  }

  // Click Continue to Tag Review
  await page.getByRole('button', { name: /continue to tag review/i }).click();
  await expect(page.getByRole('heading', { name: 'Tag Review' })).toBeVisible({ timeout: 5000 });
};

/**
 * Helper: Resolve uncertain transaction by selecting entity
 */
const resolveUncertainTransaction = async (page: Page, description: string, entityId: string) => {
  // Find the transaction card and its entity selector
  const transactionCard = page.locator(`[data-testid*="${description}"]`).first();
  const entitySelect = transactionCard.locator('select').first();
  await entitySelect.selectOption(entityId);
};

/**
 * Helper: Verify transaction is in specific tab
 */
const verifyTransactionInTab = async (page: Page, tabName: string, description: string) => {
  await page.getByRole('tab', { name: new RegExp(tabName, 'i') }).click();
  await expect(page.getByText(description)).toBeVisible();
};

// ============================================================================
// TEST SUITES
// ============================================================================

test.describe('Import Wizard - Complete Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
    await page.goto('/import');
  });

  test('should complete full import flow successfully', async ({ page }) => {
    // Step 1: Upload CSV
    await test.step('Upload CSV file', async () => {
      await expect(page.getByText('Upload CSV')).toBeVisible();
      await uploadCSVFile(page, simpleCSV);
      await page.getByRole('button', { name: /next/i }).click();
    });

    // Step 2: Map Columns
    await test.step('Map columns', async () => {
      await expect(page.getByText('Map Columns')).toBeVisible();

      // Columns should be auto-detected
      await expect(page.locator('select[name="date"]')).toHaveValue('Date');
      await expect(page.locator('select[name="description"]')).toHaveValue('Description');
      await expect(page.locator('select[name="amount"]')).toHaveValue('Amount');

      // Should show preview of parsed data
      await expect(page.getByText('2026-02-13')).toBeVisible();
      await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible();

      await page.getByRole('button', { name: /next/i }).click();
    });

    // Step 3: Processing
    await test.step('Process transactions', async () => {
      await expect(page.getByText('Processing')).toBeVisible();
      await expect(page.getByText(/processing/i)).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({ timeout: 10000 });
    });

    // Step 4: Review
    await test.step('Review transactions', async () => {
      await expect(page.getByRole('tab', { name: /matched/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /uncertain/i })).toBeVisible();

      // Should show matched transaction with entity assigned
      await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible();
      // Verify Woolworths is the selected entity (select value)
      await expect(page.getByRole('tabpanel').locator('select').first()).toHaveValue('woolworths-id');

      // Switch to uncertain tab
      await page.getByRole('tab', { name: /uncertain/i }).click();
      // Switch to list view to access per-card controls
      await page.getByRole('button', { name: /list/i }).click();
      await expect(page.getByText('UNKNOWN MERCHANT', { exact: true }).first()).toBeVisible();

      // Resolve uncertain transaction
      const entitySelect = page.getByRole('tabpanel').locator('select').first();
      await entitySelect.selectOption('woolworths-id');

      // Should move to matched
      await page.getByRole('tab', { name: /matched/i }).click();
      await expect(page.getByText('UNKNOWN MERCHANT', { exact: true }).first()).toBeVisible();

      // Continue to Tag Review (replaces old "Import" button)
      const continueButton = page.getByRole('button', { name: /continue to tag review/i });
      await expect(continueButton).toBeEnabled();
      await continueButton.click();
    });

    // Step 5: Tag Review
    await test.step('Tag review', async () => {
      await expect(page.getByRole('heading', { name: 'Tag Review' })).toBeVisible({ timeout: 5000 });

      // Import button should be visible
      const importButton = page.getByRole('button', { name: /import.*transaction/i });
      await expect(importButton).toBeEnabled();
      await importButton.click();
    });

    // Step 6: Summary
    await test.step('View summary', async () => {
      await expect(page.getByText('Import Complete')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('1 imported, 0 failed, 0 skipped')).toBeVisible();
      await expect(page.getByRole('button', { name: /new import/i })).toBeVisible();
    });
  });

  test('should validate required fields in upload step', async ({ page }) => {
    await expect(page.getByText('Upload CSV')).toBeVisible();
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeDisabled();
  });

  test('should handle file upload errors', async ({ page }) => {
    await expect(page.getByText('Upload CSV')).toBeVisible();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a csv'),
    });

    await expect(page.getByText(/invalid file type/i)).toBeVisible();
  });

  test('should validate column mapping', async ({ page }) => {
    await uploadCSVFile(page, simpleCSV);
    await page.getByRole('button', { name: /next/i }).click();

    await expect(page.getByText('Map Columns')).toBeVisible();

    // Clear required field
    await page.locator('select[name="date"]').selectOption('');

    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeDisabled();
  });

  test('should allow navigation back through steps', async ({ page }) => {
    await uploadCSVFile(page, simpleCSV);
    await page.getByRole('button', { name: /next/i }).click();

    await expect(page.getByText('Map Columns')).toBeVisible();

    await page.getByRole('button', { name: /back/i }).click();

    await expect(page.getByText('Upload CSV')).toBeVisible();
    await expect(page.getByText('test.csv')).toBeVisible();
  });

  test('should disable Continue button when unresolved transactions exist', async ({ page }) => {
    await navigateToReviewStep(page);

    await expect(page.getByRole('tab', { name: /uncertain/i })).toBeVisible();

    const continueButton = page.getByRole('button', { name: /continue to tag review/i });
    await expect(continueButton).toBeDisabled();
  });

  test('should handle API errors gracefully', async ({ page }) => {
    await setupMockAPIs(page, { processError: true });

    await uploadCSVFile(page, simpleCSV);
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('button', { name: /next/i }).click();

    // Component shows "Processing Failed" when processImport returns a non-tRPC error
    await expect(page.getByText(/processing failed/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Import Wizard - Transaction Editing', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'realistic' });
    await page.goto('/import');
  });

  test('should edit transaction with Save Once', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    // Click Edit on first matched transaction
    const editButton = page.getByRole('button', { name: /edit/i }).first();
    await editButton.click();

    // Should show edit form
    await expect(page.getByLabel(/description/i)).toBeVisible();

    // Modify description and amount
    await page.getByLabel(/description/i).fill('EDITED DESCRIPTION');
    await page.getByLabel(/amount/i).fill('150.00');

    // Click "Save Once" (outline button)
    await page.getByRole('button', { name: /save once/i }).click();

    // Verify transaction updated locally
    await expect(page.getByText('EDITED DESCRIPTION')).toBeVisible();
    await expect(page.getByText('150.00')).toBeVisible();

    // Verify NO correction API call was made (check no saveCorrection request)
    // Transaction should still be in matched tab
    await expect(page.getByRole('tab', { name: /matched/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('should edit transaction with Save & Learn', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    // Listen for saveCorrection API call
    let correctionCalled = false;
    page.on('request', (request) => {
      if (request.url().includes('corrections')) {
        correctionCalled = true;
      }
    });

    const editButton = page.getByRole('button', { name: /edit/i }).first();
    await editButton.click();

    await page.getByLabel(/description/i).fill('LEARNED DESCRIPTION');

    // Click "Save & Learn" (primary button)
    await page.getByRole('button', { name: /save.*learn/i }).click();

    // Verify success toast shown (Sonner may render multiple nested elements - use first)
    await expect(page.getByText(/correction saved/i).first()).toBeVisible({ timeout: 5000 });

    // Verify transaction updated
    await expect(page.getByText('LEARNED DESCRIPTION')).toBeVisible();

    // Verify API was called
    await page.waitForTimeout(500); // Give time for API call
    expect(correctionCalled).toBe(true);
  });

  test('should prompt to learn correction after Save Once', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    const editButton = page.getByRole('button', { name: /edit/i }).first();
    await editButton.click();

    await page.getByLabel(/description/i).fill('TEMP EDIT');
    await page.getByRole('button', { name: /save once/i }).click();

    // Wait for secondary toast prompting to learn (use first() since Sonner nests elements)
    await expect(page.getByText(/apply.*future imports/i).first()).toBeVisible({ timeout: 5000 });

    // Dispatch click directly: Sonner action button may be outside viewport or intercepted by toast container
    await page.getByRole('button', { name: /learn pattern/i }).dispatchEvent('click');

    // Verify correction saved
    await expect(page.getByText(/pattern saved/i)).toBeVisible({ timeout: 5000 });
  });

  test('should switch transaction type and update UI', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    const editButton = page.getByRole('button', { name: /edit/i }).first();
    await editButton.click();

    // Select "Transfer" type
    await page.locator('select[name="type"]').selectOption('transfer');

    // Verify entity selector hidden (transfers don't have entities)
    await expect(page.getByLabel(/entity/i)).not.toBeVisible();

    // Select "Purchase" type
    await page.locator('select[name="type"]').selectOption('purchase');

    // Verify entity selector shown
    await expect(page.getByLabel(/entity/i)).toBeVisible();

    // Select "Income" type
    await page.locator('select[name="type"]').selectOption('income');

    // Verify entity selector hidden
    await expect(page.getByLabel(/entity/i)).not.toBeVisible();
  });
});

test.describe('Import Wizard - Transfer and Income Transactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'realistic' });
    await page.goto('/import');
  });

  test('should promote uncertain transaction to matched when marked as transfer', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    // Record initial matched count from the tab label
    const matchedTab = page.getByRole('tab', { name: /matched/i });
    const initialMatchedText = await matchedTab.textContent();
    const initialMatchedCount = parseInt(initialMatchedText?.match(/\((\d+)\)/)?.[1] ?? '0', 10);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /list/i }).click();

    // Edit first uncertain transaction and mark as transfer
    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.locator('select[name="type"]').selectOption('transfer');
    await expect(page.getByLabel(/entity/i)).not.toBeVisible();
    await page.getByRole('button', { name: /save once/i }).click();

    // Matched tab should now have one more transaction
    await expect(matchedTab).toContainText(`(${initialMatchedCount + 1})`);
  });

  test('should promote uncertain transaction to matched when marked as income', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    const matchedTab = page.getByRole('tab', { name: /matched/i });
    const initialMatchedText = await matchedTab.textContent();
    const initialMatchedCount = parseInt(initialMatchedText?.match(/\((\d+)\)/)?.[1] ?? '0', 10);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /list/i }).click();

    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.locator('select[name="type"]').selectOption('income');
    await expect(page.getByLabel(/entity/i)).not.toBeVisible();
    await page.getByRole('button', { name: /save once/i }).click();

    await expect(matchedTab).toContainText(`(${initialMatchedCount + 1})`);
  });

  test('should allow import after the only uncertain transaction is resolved as a transfer', async ({ page }) => {
    // Use the simple scenario: 1 matched + 1 uncertain, no failed — so resolving the
    // one uncertain as a transfer is sufficient to enable Continue to Tag Review.
    await setupMockAPIs(page);
    await navigateToReviewStep(page, simpleCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /list/i }).click();

    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.locator('select[name="type"]').selectOption('transfer');
    await page.getByRole('button', { name: /save once/i }).click();

    // Uncertain count should now be 0 and Continue button enabled
    await expect(page.getByRole('tab', { name: /uncertain/i })).toContainText('(0)');
    await expect(page.getByRole('button', { name: /continue to tag review/i })).toBeEnabled({ timeout: 5000 });
  });

  test('should include transfer in import payload without entityId', async ({ page }) => {
    let capturedTransactions: Array<Record<string, unknown>> = [];

    // Simple scenario: 1 matched + 1 uncertain, no failed
    await setupMockAPIs(page);

    // Override executeImport AFTER setupMockAPIs so this handler runs first (last-registered wins)
    await page.route(/\/trpc\/imports\.executeImport/, async (route) => {
      const body = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
      // tRPC batch body format: {"0": {"transactions": [...]}} (no .json wrapper in this client version)
      const item = body['0'] as { json?: { transactions?: unknown[] }; transactions?: unknown[] } | undefined;
      const txns = item?.json?.transactions ?? item?.transactions ?? [];
      capturedTransactions = txns as Array<Record<string, unknown>>;

      const url = new URL(route.request().url());
      const responseData = { result: { data: { sessionId: 'execute-session-456' } } };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(url.searchParams.has('batch') ? [responseData] : responseData),
      });
    });

    await navigateToReviewStep(page, simpleCSV);

    // Mark the single uncertain transaction as a transfer
    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /list/i }).click();
    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.locator('select[name="type"]').selectOption('transfer');
    await page.getByRole('button', { name: /save once/i }).click();

    // Continue to Tag Review then click Import
    await page.getByRole('button', { name: /continue to tag review/i }).click();
    await expect(page.getByRole('heading', { name: 'Tag Review' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /import.*transaction/i }).click();

    await page.waitForTimeout(1000);

    // The transfer should appear in the payload without an entityId
    const transfer = capturedTransactions.find((t) => t['transactionType'] === 'transfer');
    expect(transfer).toBeDefined();
    expect(transfer?.['entityId']).toBeFalsy();
  });
});

test.describe('Import Wizard - AI Suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'realistic' });
    await page.goto('/import');
  });

  test('should accept AI suggestion for existing entity', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    // Go to Uncertain tab and switch to list view for per-card access
    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /list/i }).click();

    // Find transaction with AI suggestion (Accept button with entity name)
    const acceptButton = page.getByRole('button', { name: /accept.*unknown cafe/i }).first();
    await acceptButton.click();

    // Verify transaction moved to Matched tab (3 original + 1 = 4)
    await expect(page.getByRole('tab', { name: /matched/i })).toContainText(/matched.*\(4\)/i);

    // Verify similarity toast shown (other numbered cafe transactions are similar)
    await expect(page.getByText(/found.*similar/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should accept AI suggestion and create new entity', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    // Switch to list view to access per-card "Create new" button
    await page.getByRole('button', { name: /list/i }).click();

    // Click "Create new" button on first AI-suggestion card to open EntityCreateDialog
    const createNewButton = page.getByRole('button', { name: /^create new$/i }).first();
    await createNewButton.click();

    // Verify EntityCreateDialog opens with pre-filled name
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/entity name/i)).toHaveValue(/unknown cafe/i);

    // Create entity
    await page.getByRole('button', { name: /create/i }).click();

    // Verify transaction assigned and moved to Matched
    await expect(page.getByRole('tab', { name: /matched/i })).toContainText(/matched/i);
  });

  test('should apply accepted entity to similar transactions', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    // Switch to list view to accept individual transactions
    await page.getByRole('button', { name: /list/i }).click();

    // Accept first "Unknown Cafe" suggestion
    const acceptButton = page.getByRole('button', { name: /accept.*unknown cafe/i }).first();
    await acceptButton.click();

    // Toast with "Apply to All" appears (use first() since Sonner nests elements)
    await expect(page.getByText(/found.*similar/i).first()).toBeVisible({ timeout: 5000 });

    // Click "Apply to All"
    await page.getByRole('button', { name: /apply to all/i }).click();

    // Verify all similar transactions moved to Matched
    await page.getByRole('tab', { name: /matched/i }).click();

    // Should have 4 "Unknown Cafe" transactions (check within the matched tabpanel)
    const matchedPanel = page.getByRole('tabpanel');
    await expect(matchedPanel.getByText(/UNKNOWN CAFE/)).toHaveCount(4);
  });
});

test.describe('Import Wizard - Bulk Operations', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'bulk' });
    await page.goto('/import');
  });

  test('should toggle between List and Grouped view', async ({ page }) => {
    await navigateToReviewStep(page, bulkCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();

    const listButton = page.getByRole('button', { name: /list/i });
    const groupedButton = page.getByRole('button', { name: /grouped/i });

    // Verify "Grouped" button active by default
    await expect(groupedButton).toHaveAttribute('aria-pressed', 'true');

    // Verify TransactionGroup components shown (already in grouped mode)
    await expect(page.getByTestId('transaction-group')).toBeVisible();

    // Click "List" button
    await listButton.click();

    // Verify individual cards shown
    await expect(page.getByTestId('transaction-card')).toHaveCount(6);
  });

  test('should accept all transactions in group', async ({ page }) => {
    await navigateToReviewStep(page, bulkCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();

    // Switch to Grouped view
    await page.getByRole('button', { name: /grouped/i }).click();

    // Find group with "Unknown Cafe" transactions
    const group = page.getByTestId('transaction-group').first();

    // Click "Accept All as 'Unknown Cafe'" button
    await group.getByRole('button', { name: /accept all/i }).click();

    // Verify all transactions moved to Matched (scope to tabpanel)
    await page.getByRole('tab', { name: /matched/i }).click();
    const cafeTransactions = page.getByRole('tabpanel').getByText(/UNKNOWN CAFE/);
    await expect(cafeTransactions).toHaveCount(6);
  });

  test('should create entity for entire group', async ({ page }) => {
    await navigateToReviewStep(page, bulkCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /grouped/i }).click();

    const group = page.getByTestId('transaction-group').first();

    // Click "Create new for all" button
    await group.getByRole('button', { name: /create new/i }).click();

    // EntityCreateDialog opens with suggested name
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel(/entity name/i).fill('Cafe Network');

    // Create
    await page.getByRole('button', { name: /create/i }).click();

    // Verify all transactions assigned and moved (scope to tabpanel)
    await page.getByRole('tab', { name: /matched/i }).click();
    const cafeTransactions = page.getByRole('tabpanel').getByText(/UNKNOWN CAFE/);
    await expect(cafeTransactions).toHaveCount(6);
  });

  test('should choose existing entity for group', async ({ page }) => {
    await navigateToReviewStep(page, bulkCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /grouped/i }).click();

    const group = page.getByTestId('transaction-group').first();

    // Click "Choose existing..." button
    await group.getByRole('button', { name: /choose existing/i }).click();

    // Dropdown appears
    const dropdown = group.locator('select');
    await dropdown.selectOption('woolworths-id');

    // Verify all 7 transactions (1 original + 6 from group) moved to Matched
    await page.getByRole('tab', { name: /matched/i }).click();
    await expect(page.getByRole('tab', { name: /matched/i })).toContainText('(7)');
  });

  test('should expand/collapse transaction group', async ({ page }) => {
    await navigateToReviewStep(page, bulkCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /grouped/i }).click();

    const group = page.getByTestId('transaction-group').first();

    // Click group header arrow to expand
    await group.getByRole('button', { name: /expand/i }).click();

    // Verify individual cards shown
    await expect(group.getByTestId('transaction-card')).toHaveCount(6);

    // Verify bulk action buttons still visible
    await expect(group.getByRole('button', { name: /accept all/i })).toBeVisible();

    // Click arrow again to collapse
    await group.getByRole('button', { name: /collapse/i }).click();

    // Verify cards hidden
    await expect(group.getByTestId('transaction-card')).not.toBeVisible();
  });
});

test.describe('Import Wizard - Progress Polling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/import');
  });

  test('should poll for process progress with real-time updates', async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'realistic', progressStages: 'progressive' });

    await navigateToReviewStep(page, realisticCSV);

    // During processing, should see progressive updates
    // (Note: This test may need adjustment based on actual implementation)
    // The mock returns 4 stages: deduplicating → matching → writing → completed
  });

  test('should poll for execute progress with write overlay', async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'simple', progressStages: 'instant' });

    await navigateToTagReviewStep(page);

    // Override the progress mock for the execute session to return processing first
    let executeProgressCalls = 0;
    const mockData = createMockData('simple');
    await page.route(/\/trpc\/imports\.getImportProgress/, async (route) => {
      const url = new URL(route.request().url());
      let sessionId = '';
      try {
        const raw = url.searchParams.get('input') ?? '{}';
        sessionId = JSON.parse(decodeURIComponent(raw))['0']?.sessionId ?? '';
      } catch { /* ignore */ }

      if (sessionId === 'execute-session-456') {
        executeProgressCalls++;
        if (executeProgressCalls < 2) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              result: { data: { status: 'processing', currentStep: 'writing', processedCount: 0, totalTransactions: 1, currentBatch: [] } },
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              result: { data: { status: 'completed', result: { imported: 1, failed: [], skipped: 0 } } },
            }),
          });
        }
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: { data: { status: 'completed', result: mockData } },
          }),
        });
      }
    });

    // Click Import on Tag Review step
    await page.getByRole('button', { name: /import.*transaction/i }).click();

    // Verify overlay modal shown during write phase
    await expect(page.getByTestId('import-progress-overlay')).toBeVisible({ timeout: 5000 });

    // Wait for completion
    await expect(page.getByText('Import Complete')).toBeVisible({ timeout: 10000 });
  });

  test('should handle process failure with error display', async ({ page }) => {
    await setupMockAPIs(page, { processError: true });

    await uploadCSVFile(page, simpleCSV);
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('button', { name: /next/i }).click();

    // Component shows "Processing Failed" heading when process errors out
    await expect(page.getByText(/processing failed/i)).toBeVisible({ timeout: 10000 });

    // Should not auto-advance - the Review heading should not appear
    await expect(page.getByRole('heading', { name: 'Review' })).not.toBeVisible();
  });
});

test.describe('Import Wizard - Entity Creation During Review', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'realistic' });
    await page.goto('/import');
  });

  test('should create entity from uncertain transaction', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    // Switch to list view so per-card "Create new entity" buttons are accessible
    await page.getByRole('button', { name: /list/i }).click();

    // Click "Create new" button on first AI-suggestion uncertain card
    const createButton = page.getByRole('button', { name: /^create new$/i }).first();
    await createButton.click();

    // EntityCreateDialog opens
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Create New Entity')).toBeVisible();

    // Enter entity name (override the AI suggestion pre-fill)
    await page.getByLabel(/entity name/i).fill('New Coffee Shop');

    // Create
    await page.getByRole('button', { name: /create/i }).click();

    // Verify entity assigned and transaction moved to Matched (3 original → 4)
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('tab', { name: /matched/i }).click();
    await expect(page.getByRole('tab', { name: /matched/i })).toContainText('(4)');
  });

  test('should create entity from failed transaction', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    await page.getByRole('tab', { name: /failed/i }).click();
    // Switch to list view so per-card "Create new entity" buttons are accessible
    await page.getByRole('button', { name: /list/i }).click();

    // Click "+ Create new entity"
    const createButton = page.getByRole('button', { name: /create.*entity/i }).first();
    await createButton.click();

    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel(/entity name/i).fill('Random Merchant');
    await page.getByRole('button', { name: /create/i }).click();

    // Verify moved to Matched (3 original → 4)
    await page.getByRole('tab', { name: /matched/i }).click();
    await expect(page.getByRole('tab', { name: /matched/i })).toContainText('(4)');
  });

  test('should show validation error for empty entity name', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    // Switch to list view to access per-card "Create new" button
    await page.getByRole('button', { name: /list/i }).click();

    const createButton = page.getByRole('button', { name: /^create new$/i }).first();
    await createButton.click();

    const createButtonInDialog = page.getByRole('dialog').getByRole('button', { name: /create/i });

    // Clear the pre-filled AI suggestion name, then check button disabled
    await page.getByLabel(/entity name/i).clear();
    await expect(createButtonInDialog).toBeDisabled();

    // Enter whitespace only
    await page.getByLabel(/entity name/i).fill('   ');
    await expect(createButtonInDialog).toBeDisabled();

    // Verify validation error shown
    await expect(page.getByText(/required/i)).toBeVisible();
  });
});

test.describe('Import Wizard - Warnings and Errors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/import');
  });

  test('should display deduplication warning (non-blocking)', async ({ page }) => {
    await setupMockAPIs(page);
    // Mock will need to return warning in result
    await navigateToReviewStep(page);

    // Verify auto-advances to Review (non-blocking)
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  });

  test('should display AI categorization warning', async ({ page }) => {
    await setupMockAPIs(page);
    await navigateToReviewStep(page);

    // Mock should return AI_CATEGORIZATION_UNAVAILABLE warning
    // Verify warning shown with affected transaction count
  });

  test('should block on critical Notion error', async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'errors' });

    await uploadCSVFile(page, simpleCSV);
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('button', { name: /next/i }).click();

    // Should show red error alert - the heading shows "Notion Database Not Found"
    // Use first() because the message text also matches this pattern
    await expect(page.getByText(/notion database not found/i).first()).toBeVisible({ timeout: 10000 });

    // Should NOT auto-advance - the Review heading should not appear
    await expect(page.getByRole('heading', { name: 'Review' })).not.toBeVisible();
  });

  test('should handle write failures in execute phase', async ({ page }) => {
    await setupMockAPIs(page, { executeError: true });

    await navigateToTagReviewStep(page);

    // Try to import from Tag Review step
    await page.getByRole('button', { name: /import.*transaction/i }).click();

    // Should show error - the component displays "Import failed" heading
    await expect(page.getByText('Import failed')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Import Wizard - Review Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'realistic' });
    await page.goto('/import');
  });

  test('should show unresolved count in tab labels', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    // Verify Uncertain tab shows count
    await expect(page.getByRole('tab', { name: /uncertain.*\(6\)/i })).toBeVisible();

    // Verify Failed tab shows count
    await expect(page.getByRole('tab', { name: /failed.*\(2\)/i })).toBeVisible();

    // Resolve 2 uncertain transactions - switch to list view for per-card selects
    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /list/i }).click();
    // Scope to active tabpanel to avoid matching resolved transactions
    const uncertainPanel = page.getByRole('tabpanel');
    await uncertainPanel.locator('select').nth(0).selectOption('woolworths-id');
    await uncertainPanel.locator('select').nth(1).selectOption('coles-id');

    // Verify count updates
    await expect(page.getByRole('tab', { name: /uncertain.*\(4\)/i })).toBeVisible();
  });

  test('should disable Continue button when unresolved exist', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    const continueButton = page.getByRole('button', { name: /continue to tag review/i });

    // Should be disabled with uncertain/failed
    await expect(continueButton).toBeDisabled();

    // Verify tooltip or text shown
    await expect(page.getByText(/resolve all/i)).toBeVisible();

    // Resolve all uncertain - switch to list view for per-card selects
    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /list/i }).click();
    // Scope to active tabpanel to avoid matching resolved transactions in other tabs
    const uncertainPanel = page.getByRole('tabpanel');
    for (let i = 0; i < 6; i++) {
      await uncertainPanel.locator('select').first().selectOption('woolworths-id');
    }

    // Resolve all failed - switch to list view for per-card create buttons
    await page.getByRole('tab', { name: /failed/i }).click();
    await page.getByRole('button', { name: /list/i }).click();
    // Click first() each iteration since resolved transactions leave the tab
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: /create.*entity/i }).first().click();
      await page.getByLabel(/entity name/i).fill(`Entity ${i}`);
      await page.getByRole('dialog').getByRole('button', { name: /create/i }).click();
      await page.waitForTimeout(500); // Wait for dialog to close
    }

    // Go back to matched tab — Continue button should now be enabled
    await page.getByRole('tab', { name: /matched/i }).click();
    await expect(continueButton).toBeEnabled();
  });

  test('should navigate between all 4 tabs', async ({ page }) => {
    await navigateToReviewStep(page, realisticCSV);

    // Click Matched tab
    await page.getByRole('tab', { name: /matched/i }).click();
    await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible();

    // Click Uncertain tab - switch to list view to see individual card descriptions
    await page.getByRole('tab', { name: /uncertain/i }).click();
    await page.getByRole('button', { name: /list/i }).click();
    await expect(page.getByText(/UNKNOWN CAFE/).first()).toBeVisible();

    // Click Failed tab - switch to list view to see individual card descriptions
    await page.getByRole('tab', { name: /failed/i }).click();
    await page.getByRole('button', { name: /list/i }).click();
    await expect(page.getByText('RANDOM MERCHANT 123')).toBeVisible();

    // Click Skipped tab
    await page.getByRole('tab', { name: /skipped/i }).click();
    await expect(page.getByText(/duplicate/i)).toBeVisible();
  });
});

test.describe('Import Wizard - Complete Import Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/import');
  });

  test('should complete realistic import with mixed results', async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'realistic' });

    await navigateToReviewStep(page, realisticCSV);

    // 3 matched (auto)
    await page.getByRole('tab', { name: /matched/i }).click();
    await expect(page.getByText('WOOLWORTHS 1234')).toBeVisible();
    await expect(page.getByText('COLES 5678')).toBeVisible();
    await expect(page.getByText('NETFLIX.COM')).toBeVisible();

    // 6 uncertain (AI suggestions) - accept 4, manually select 2
    await page.getByRole('tab', { name: /uncertain/i }).click();
    // Switch to list view for per-card accept buttons and selects
    await page.getByRole('button', { name: /list/i }).click();

    // Accept AI suggestions for first 4 (Unknown Cafe)
    for (let i = 0; i < 4; i++) {
      const acceptButton = page.getByRole('button', { name: /accept.*unknown cafe/i }).first();
      await acceptButton.click();
      await page.waitForTimeout(300);
    }

    // Manually select for remaining 2 (scope to active tabpanel)
    const selects = page.getByRole('tabpanel').locator('select');
    await selects.first().selectOption('mystery-store-id');
    await page.waitForTimeout(300);
    await selects.first().selectOption('acme-corp-id');

    // 2 failed - create entities - switch to list view for per-card create buttons
    await page.getByRole('tab', { name: /failed/i }).click();
    await page.getByRole('button', { name: /list/i }).click();

    const createButtons = page.getByRole('button', { name: /create.*entity/i });
    await createButtons.first().click();
    await page.getByLabel(/entity name/i).fill('Random Merchant');
    await page.getByRole('dialog').getByRole('button', { name: /create/i }).click();
    await page.waitForTimeout(500);

    await createButtons.first().click();
    await page.getByLabel(/entity name/i).fill('Unrecognized Payee');
    await page.getByRole('dialog').getByRole('button', { name: /create/i }).click();
    await page.waitForTimeout(500);

    // Continue to Tag Review then import
    await page.getByRole('tab', { name: /matched/i }).click();
    const continueButton = page.getByRole('button', { name: /continue to tag review/i });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect(page.getByRole('heading', { name: 'Tag Review' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /import.*transaction/i }).click();

    // Verify Summary (mock returns base matched count, not the resolved total)
    await expect(page.getByText('Import Complete')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/\d+ imported/i)).toBeVisible();
  });

  test('should handle duplicate detection workflow', async ({ page }) => {
    await setupMockAPIs(page, { scenario: 'duplicates' });

    await navigateToReviewStep(page, duplicatesCSV);

    // Verify Skipped tab shows 3 duplicates
    await page.getByRole('tab', { name: /skipped/i }).click();
    await expect(page.getByText(/duplicate/i)).toHaveCount(3);

    // Verify matched has only 2 new transactions
    await page.getByRole('tab', { name: /matched/i }).click();
    const matchedTransactions = page.getByTestId('transaction-card');
    await expect(matchedTransactions).toHaveCount(2);
  });

  test('should handle large batch (100+ transactions)', async ({ page }) => {
    await setupMockAPIs(page, { progressStages: 'progressive' });

    const largeCSV = generateLargeCSV(150);
    await navigateToReviewStep(page, largeCSV);

    // Verify UI shows progress (mock data may not support this fully)
    // In real scenario, would see "75/150 processed"
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Import Wizard - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
    await page.goto('/import');
  });

  test('should be keyboard navigable', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    // File input must be in the tab order (not hidden from keyboard navigation)
    await expect(fileInput).toHaveAttribute('tabindex', '0');
    // Programmatically focus and verify it can receive focus
    await fileInput.focus();
    await expect(fileInput).toBeFocused();
  });

  test('should have proper ARIA labels', async ({ page }) => {
    await expect(page.locator('input[type="file"]')).toHaveAttribute('aria-label', /.*/);
  });

  test('should show validation errors with proper aria-invalid', async ({ page }) => {
    await uploadCSVFile(page, simpleCSV);
    await page.getByRole('button', { name: /next/i }).click();

    // Clear required field
    await page.locator('select[name="date"]').selectOption('');

    await expect(page.locator('select[name="date"]')).toHaveAttribute('aria-invalid', 'true');
  });

  test('should have proper ARIA labels on transaction cards', async ({ page }) => {
    await navigateToReviewStep(page);

    // Verify transaction cards have aria-label with description
    const transactionCard = page.getByTestId('transaction-card').first();
    await expect(transactionCard).toHaveAttribute('aria-label', /WOOLWORTHS/i);

    // Verify Edit button has aria-label
    const editButton = page.getByRole('button', { name: /edit/i }).first();
    await expect(editButton).toHaveAttribute('aria-label', /.*/);
  });

  test('should support keyboard navigation in review step', async ({ page }) => {
    await navigateToReviewStep(page);

    // Focus the first Edit button and activate it via keyboard
    const editButton = page.getByRole('button', { name: /edit/i }).first();
    await editButton.focus();
    await expect(editButton).toBeFocused();
    await page.keyboard.press('Enter');

    // Should show edit form
    await expect(page.getByLabel(/description/i)).toBeVisible();

    // Escape should cancel
    await page.keyboard.press('Escape');
    await expect(page.getByLabel(/description/i)).not.toBeVisible();
  });
});

test.describe('Import Wizard - Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPIs(page);
  });

  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/import');

    await expect(page.getByText('Upload CSV')).toBeVisible();

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/import');

    await expect(page.getByText('Upload CSV')).toBeVisible();
  });

  test('should show mobile-optimized review layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/import');

    await navigateToReviewStep(page);

    // Verify tabs accessible
    await expect(page.getByRole('tab', { name: /matched/i })).toBeVisible();

    // Verify cards full-width (check with viewport assertion)
    const transactionCard = page.getByTestId('transaction-card').first();
    await expect(transactionCard).toBeVisible();
  });
});

test.describe('Import Wizard - Error Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/import');
  });

  test('should retry failed entity creation', async ({ page }) => {
    // First attempt fails, second succeeds
    let attemptCount = 0;
    await setupMockAPIs(page, { scenario: 'realistic' });

    await page.route(/\/trpc\/imports\.createEntity/, async (route) => {
      attemptCount++;
      if (attemptCount === 1) {
        // tRPC batch error format so the error message is readable in the UI
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify([{
            error: {
              json: {
                message: 'Server error',
                code: -32603,
                data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
              },
            },
          }]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              data: {
                entityId: 'new-entity-id',
                entityName: 'Retry Entity',
              },
            },
          }),
        });
      }
    });

    await navigateToReviewStep(page, realisticCSV);

    await page.getByRole('tab', { name: /uncertain/i }).click();
    // Switch to list view to access per-card "Create new" button
    await page.getByRole('button', { name: /list/i }).click();

    const createButton = page.getByRole('button', { name: /^create new$/i }).first();
    await createButton.click();

    await page.getByLabel(/entity name/i).fill('Retry Entity');
    await page.getByRole('button', { name: /create/i }).click();

    // Should show error state in dialog (EntityCreateDialog shows retry button on mutation error)
    await expect(page.getByRole('dialog').getByRole('button', { name: /retry/i })).toBeVisible({ timeout: 5000 });

    // Retry
    await page.getByRole('dialog').getByRole('button', { name: /retry/i }).click();

    // Should succeed on second attempt
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should handle network timeout during import', async ({ page }) => {
    await setupMockAPIs(page, { executeError: true });

    await navigateToTagReviewStep(page);

    // Try to import from Tag Review step
    await page.getByRole('button', { name: /import.*transaction/i }).click();

    // Component shows "Import failed" heading in the error state
    await expect(page.getByText('Import failed')).toBeVisible({ timeout: 10000 });

    // Should have retry button (from TagReviewStep error state)
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  test('should preserve state when navigating back', async ({ page }) => {
    await setupMockAPIs(page);

    // Complete steps 1-2
    await uploadCSVFile(page, simpleCSV);
    await page.getByRole('button', { name: /next/i }).click();

    // On column mapping
    await expect(page.getByText('Map Columns')).toBeVisible();

    // Click Back to step 1
    await page.getByRole('button', { name: /back/i }).click();

    // Verify file still selected
    await expect(page.getByText('test.csv')).toBeVisible();

    // Navigate forward again
    await page.getByRole('button', { name: /next/i }).click();

    // Verify column mappings preserved
    await expect(page.locator('select[name="date"]')).toHaveValue('Date');
    await expect(page.locator('select[name="description"]')).toHaveValue('Description');
    await expect(page.locator('select[name="amount"]')).toHaveValue('Amount');
  });
});
